globalThis.UsageParser = (() => {
 const pct=/(\d+(?:\.\d+)?)\s*%/;
 const resetRE=/reset|refresh|重設|重置|刷新/i;
 const defs={
  chatgpt:[['five_hour','5 小時用量上限',/5\s*[- ]?\s*(?:hour|小時)|five.hour|五小時/i],['weekly','每週上限',/weekly|每[週周]|週上限/i]],
  gemini:[['current','目前用量',/current|目前用量|當前用量|本次|session/i],['weekly','每週上限',/weekly|每[週周]|週上限/i]],
  claude:[['current','目前工作階段',/目前工作階段|本次工作階段|current session|目前用量|當前|session/i],['weekly','每週用量',/^本週$|每週用量|weekly|週上限/i]]
 };
 const isClaudeWeeklyHeading=s=>/^(?:本週|weekly(?:\s+limits?)?|每週限制|每週用量)[\s\u2304\u25be\u25bc\u2305\u2303\u25b2\u25b4\u25b3v\u02c5\u02c4]*$/i.test(s)&&!/%/.test(s);
 const number=s=>{const m=s.match(pct);return m&&Number(m[1])<=100?Number(m[1]):null;};
 function parseUsage(text,provider){
  const lines=text.replace(/[\u00a0\u202f]/g,' ').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/％/g,'%').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(provider==='grok'){
   const balanceMark=/額外使用額度|額外用量|额外使用额度|额外用量|額外點數|额外点数|extra\s+credits?|additional\s+credits?|bonus\s+credits?|extra\s+usage(?:\s+allowance)?|additional\s+usage/i;
   const kept=[];
   for(const line of lines){
    const at=line.search(balanceMark);
    if(at<0){kept.push(line);continue;}
    if(at>0){const head=line.slice(0,at).trim();if(head)kept.push(head);}
    break;
   }
   lines.splice(0,lines.length,...kept);
   const flat=lines.join(' ');
   const sections=[flat];
   for(const marker of flat.matchAll(/使用情況|使用狀況|usage/gi))sections.unshift(flat.slice(marker.index));
   let used=null;
   for(const section of sections){
    const header=section.match(/(?:每[週周]|weekly|supergrok|premium|配額|用量)[^%]{0,160}?(\d+(?:\.\d+)?)\s*%/i);
    if(header&&Number(header[1])<=100){used=Number(header[1]);break;}
    const direct=section.match(/(\d+(?:\.\d+)?)\s*%\s*(?:已使用|已用|used)/i)||section.match(/(?:已使用|已用|used)\s*(\d+(?:\.\d+)?)\s*%/i);
    if(direct&&Number(direct[1])<=100){used=Number(direct[1]);break;}
   }
   const products=[];
   const aliases=[['Imagine',/^(Imagine|想像|想象)$/i],['Grok Bot',/^Grok\s*Bot$/i],['Cursor',/^(Cursor|遊標|游标)$/i],['Deep Search',/^(Deep\s*Search|深度搜尋|深度搜索)$/i],['Reasoning',/^(Reasoning|推理)$/i],['Chat',/^(Chat|聊天)$/i],['Voice',/^(Voice|語音|语音)$/i],['Build',/^(Build|建置|構建|构建)$/i],['API',/^API$/i]];
   const headerRE=/reset|refresh|weekly|total|remaining|used|usage|premium|supergrok|重設|重置|刷新|每[週周]|本[週周]|總|总|已使用|已用|剩餘|剩余|用量|使用情況|使用狀況/i;
   function addProduct(raw,value){
    const name=raw.replace(/\s+/g,' ').trim();
    if(!name||name.length>24||headerRE.test(name)||balanceMark.test(name)||value<0||value>100)return;
    const label=aliases.find(([,re])=>re.test(name))?.[0]||name;
    if(!products.some(p=>p.label.toLowerCase()===label.toLowerCase()))products.push({label,value});
   }
   for(const m of flat.matchAll(/(?:^|[^A-Za-z0-9])(Imagine|想像|想象|Grok\s*Bot|Grok\s*[23]|Cursor|遊標|游标|Deep\s*Search|深度搜尋|深度搜索|Reasoning|推理|Chat|聊天|Voice|語音|语音|Build|建置|構建|构建|API)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/gi)){
    addProduct(m[1],Number(m[2]));
   }
   const usageStart=lines.findIndex(s=>/使用情況|使用狀況|usage|每[週周]|weekly/i.test(s));
   if(usageStart>=0)for(let i=usageStart;i<lines.length;i++){
    const row=lines[i].match(/^([^%\d:：]{1,24}?)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%$/);
    if(row)addProduct(row[1],Number(row[2]));
    else if(/^[^%\d:：]{1,24}[:：]?$/.test(lines[i])&&/^\d+(?:\.\d+)?\s*%$/.test(lines[i+1]||''))addProduct(lines[i].replace(/[:：]$/,''),number(lines[i+1]));
   }
   const productSum=products.reduce((sum,p)=>sum+p.value,0);
   const percentages=[...flat.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1])).filter(n=>n<=100);
   if(products.length>=1&&productSum<=100&&percentages.some(n=>Math.abs(n-productSum)<0.6)&&used===null)used=productSum;
   if(used===null&&/使用情況|使用狀況|usage/i.test(flat)){
    const values=percentages;
    if(values.length===3&&Math.abs(values[0]-values[1]-values[2])<0.6)used=values[0];
    else if(values.length>0)used=values[0];
   }
   const sum=products.reduce((a,p)=>a+p.value,0);
   let totalInferred=false;
   if(products.length>=1&&used!==null&&used<sum-0.6){
    used=sum;totalInferred=true;
   }
   const reset=lines.find(s=>resetRE.test(s))||'';
   if(used===null||used<0||used>100)return {metrics:[],state:'no_numbers'};
   const consistent=sum<=used+0.6&&sum<=100;
   return {metrics:[{id:'total',label:'總用量',value:used,kind:'used',reset}],distribution:{used,remaining:100-used,products,consistent,unassigned:Math.max(0,used-sum),totalInferred},state:'ready'};
  }
  const metrics=[];
  for(const [id,label,re]of defs[provider]||[]){
   const heading=provider==='claude'&&id==='weekly'?lines.findIndex(isClaudeWeeklyHeading):-1;
   const start=provider==='claude'&&id==='weekly'?heading:lines.findIndex(s=>re.test(s)&&!resetRE.test(s));if(start<0)continue;
   let end=lines.length;
   for(let i=start+1;i<lines.length;i++){if((provider==='claude'&&id==='current'&&isClaudeWeeklyHeading(lines[i]))||(defs[provider]||[]).some(d=>d[2].test(lines[i])&&!resetRE.test(lines[i])&&!(provider==='claude'&&d[0]==='weekly'))||/^(sonnet|opus|額外用量|extra usage)/i.test(lines[i])){end=i;break;}}
   const block=lines.slice(start,end),valueLines=block.filter(s=>number(s)!==null&&!resetRE.test(s));
   const usedRE=/已使用|已用|\bused\b/i,remainingRE=/還剩|剩餘|剩余|remaining/i;
   const labeledValue=valueLines.find(s=>usedRE.test(s)&&!remainingRE.test(s))||valueLines.find(s=>remainingRE.test(s));
   const firstMessageNotice=provider==='claude'&&id==='current'&&block.some(s=>/after your first message|from your first message|first message|\u7b2c\u4e00\u5247\u8a0a\u606f|\u9996\u6b21\u8a0a\u606f/i.test(s));
   if(!labeledValue&&firstMessageNotice){metrics.push({id,label,value:0,kind:'used',reset:''});continue;}
   const valueLine=labeledValue||valueLines.find(s=>provider!=='claude'||!/\b100\s*%/.test(s));if(!valueLine)continue;
   const value=number(valueLine),kind=remainingRE.test(valueLine)?'remaining':usedRE.test(valueLine)?'used':'reported';
   const reset=block.find(s=>resetRE.test(s))||'';
   metrics.push({id,label,value,kind,reset});
  }
  if(provider==='claude'){
   const fableStart=lines.findIndex(s=>/^Fable$/i.test(s));
   if(fableStart>=0){const next=lines.findIndex((s,i)=>i>fableStart&&/^(sonnet|opus|extra usage)/i.test(s));const block=lines.slice(fableStart,next<0?lines.length:next);const fableUsedRE=/\u5df2\u4f7f\u7528|\u5df2\u7528|\bused\b/i;const fableRemainingRE=/\u9084\u5269|\u5269\u9918|\u5269\u4f59|remaining/i;const valueLine=block.find(s=>fableUsedRE.test(s)&&!fableRemainingRE.test(s)&&number(s)!==null)||block.find(s=>number(s)!==null&&!resetRE.test(s));if(valueLine)metrics.push({id:'fable',label:'Fable',value:number(valueLine),kind:fableUsedRE.test(valueLine)?'used':'reported',reset:block.find(s=>resetRE.test(s))||'',note:block.find(s=>/at most 50%|up to 50%|\u6700\u591a.{0,24}50%|\u81f3\u591a.{0,24}50%|\u6bcf\u9031\u4e0a\u9650\u7684\s*50%/i.test(s))||''});}
  }
  return {metrics,state:metrics.length?'ready':'no_numbers'};
 }
 return {parseUsage};
})();
