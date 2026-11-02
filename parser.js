globalThis.UsageParser = (() => {
 const pct=/(\d+(?:\.\d+)?)\s*%/;
 const resetRE=/reset|refresh|重設|重置|刷新/i;
 const defs={
  chatgpt:[['five_hour','5 小時用量上限',/5\s*[- ]?\s*(?:hour|小時)|five.hour|五小時/i],['weekly','每週上限',/weekly|每[週周]|週上限/i]],
  gemini:[['current','目前用量',/current|目前用量|當前用量|本次|session/i],['weekly','每週上限',/weekly|每[週周]|週上限/i]],
  claude:[['current','本次工作階段',/current session|目前用量|本次工作階段|當前|session/i],['weekly','每週用量',/weekly|每[週周]|週上限/i]]
 };
 const number=s=>{const m=s.match(pct);return m&&Number(m[1])<=100?Number(m[1]):null;};
 function parseUsage(text,provider){
  const lines=text.replace(/[\u00a0\u202f]/g,' ').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/％/g,'%').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(provider==='grok'){
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
   for(const m of flat.matchAll(/\b(Imagine|Grok\s*Bot|Grok\s*3|Grok\s*2|Deep\s*Search|Reasoning|Chat|Voice|Build|API)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/gi)){
    const value=Number(m[2]);if(value<=100&&!products.some(p=>p.label.toLowerCase()===m[1].toLowerCase()))products.push({label:m[1].replace(/grok\s*bot/i,'Grok Bot'),value});
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
   const start=lines.findIndex(s=>re.test(s)&&!resetRE.test(s));if(start<0)continue;
   let end=lines.length;
   for(let i=start+1;i<lines.length;i++){if((defs[provider]||[]).some(d=>d[2].test(lines[i])&&!resetRE.test(lines[i]))||/^(sonnet|opus|額外用量|extra usage)/i.test(lines[i])){end=i;break;}}
   const block=lines.slice(start,end),valueLine=block.find(s=>number(s)!==null&&!resetRE.test(s));if(!valueLine)continue;
   const value=number(valueLine),kind=/remaining|剩餘|剩余/i.test(valueLine)?'remaining':/used|已使用|已用/i.test(valueLine)?'used':'reported';
   const reset=block.find(s=>resetRE.test(s))||'';
   metrics.push({id,label,value,kind,reset});
  }
  return {metrics,state:metrics.length?'ready':'no_numbers'};
 }
 return {parseUsage};
})();
