importScripts('parser.js');
const CONFIG={chatgpt:{hosts:['chatgpt.com','chat.openai.com'],url:'https://chatgpt.com/settings/usage?tab=overview'},gemini:{hosts:['gemini.google.com'],url:'https://gemini.google.com/usage'},grok:{hosts:['grok.com'],url:'https://grok.com/?_s=usage'},claude:{hosts:['claude.ai'],url:'https://claude.ai/settings/usage'}};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=(promise,ms,fallback)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(fallback),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const usageURL=url=>{try{const u=new URL(url);return /\/settings\/usage|\/usage\b/.test(u.pathname)||u.searchParams.get('_s')==='usage';}catch{return false;}};
async function readTab(id){
 try{let d=await bounded(chrome.tabs.sendMessage(id,{type:'READ_USAGE'}),1500,null);if(d?.version===2&&d.readerVersion==='1.6.7')return d;}catch{}
 try{await bounded(chrome.scripting.executeScript({target:{tabId:id},files:['parser.js','content.js']}),2000,null);return await bounded(chrome.tabs.sendMessage(id,{type:'READ_USAGE'}),1500,null);}catch{return null;}
}
async function readGrokFrames(id){
 try{
  const frames=await bounded(chrome.scripting.executeScript({target:{tabId:id,allFrames:true},func:()=>{
   const samples=[];const visited=new Set();
   const productRE=/(?:^|[^A-Za-z0-9])(Imagine|想像|想象|Grok\s*Bot|Grok\s*[23]|Cursor|遊標|游标|Deep\s*Search|深度搜尋|深度搜索|Reasoning|推理|Chat|聊天|Voice|語音|语音|Build|建置|構建|构建|API)(?=$|[^A-Za-z])/i;
   const headerRE=/reset|refresh|weekly|total|remaining|used|usage|premium|supergrok|重設|重置|刷新|每[週周]|本[週周]|總|总|已使用|已用|剩餘|剩余|用量|使用情況|使用狀況/i;
   const balanceRE=/額外使用額度|額外用量|额外使用额度|额外用量|額外點數|额外点数|extra\s+credits?|additional\s+credits?|bonus\s+credits?|extra\s+usage(?:\s+allowance)?|additional\s+usage/i;
   function visit(root){
    if(!root||visited.has(root)||samples.length>16)return;
    visited.add(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const parts=[];let node,count=0;
    while((node=walker.nextNode())&&count++<4000){
     const parent=node.parentElement;
     if(!parent||!node.nodeValue?.trim()||parent.closest('script,style,template,noscript,[hidden],[aria-hidden="true"]'))continue;
     if(getComputedStyle(parent).visibility==='hidden'||getComputedStyle(parent).display==='none')continue;
     parts.push(node.nodeValue.trim());
    }
    const displayed=root.innerText||'';
    if(displayed)samples.push(displayed.slice(-30000));
    if(parts.length)samples.push(parts.join(' ').slice(-30000));
    for(const panel of root.querySelectorAll?.('[role="dialog"],dialog,[role="tabpanel"],main')||[]){
     const text=panel.innerText||'';if(/使用情況|使用狀況|usage|premium|supergrok/i.test(text))samples.push(text.slice(-16000));
    }
    for(const bar of root.querySelectorAll?.('[role="progressbar"],progress')||[]){
     if(getComputedStyle(bar).display==='none'||getComputedStyle(bar).visibility==='hidden')continue;
     const raw=bar.getAttribute('aria-valuenow')??bar.getAttribute('value');
     const min=Number(bar.getAttribute('aria-valuemin')??0),max=Number(bar.getAttribute('aria-valuemax')??bar.getAttribute('max')??100);
     const value=(Number(raw)-min)/(max-min)*100;
     if(raw===null||!Number.isFinite(value)||value<0||value>100)continue;
     const label=bar.getAttribute('aria-label')||(bar.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.innerText||'').join(' ').trim();
     const context=bar.parentElement?.parentElement?.innerText||'';
     const name=label||context.slice(0,160);
     const product=label.match(productRE)||context.match(productRE);
     const nearby=[label,...context.split(/\n+/)].map(s=>s.trim().replace(/[:：]$/,'')).find(s=>s.length>=1&&s.length<=24&&!/[\d%％]/.test(s)&&!headerRE.test(s)&&!balanceRE.test(s));
     if(product)samples.push(`${product[1]} ${value}%`);
     else if(/每[週周]|weekly|premium|supergrok/i.test(name))samples.push(`每週 Premium 限制\n${value}% 已使用`);
     else if(!balanceRE.test(label)&&!balanceRE.test(name)&&nearby&&/使用情況|使用狀況|usage|每[週周]|weekly/i.test(root.innerText||''))samples.push(`Usage\n${nearby} ${value}%`);
    }
    for(const e of root.querySelectorAll?.('*')||[])if(e.shadowRoot)visit(e.shadowRoot);
   }
   visit(document.body);return samples;
  }}),2000,[]);
  const samples=frames.flatMap(f=>f.result||[]),parsed=samples.map(s=>UsageParser.parseUsage(s,'grok'));
  parsed.push(UsageParser.parseUsage(samples.join('\n'),'grok'));
  const rank=p=>p.metrics.length*10+(p.distribution?.products.length||0)+(p.distribution?.consistent?20:0);
  parsed.sort((a,b)=>rank(b)-rank(a));
  const best=parsed[0];
  if(!best||!best.metrics||best.metrics.length===0){
   const values=[...new Set([...samples.join(' ').matchAll(/(\d+(?:\.\d+)?)\s*[%％]/g)].map(m=>Number(m[1])).filter(n=>n<=100))].slice(0,12);
   return {metrics:[],state:'no_numbers',readInfo:{frames:frames.length,framePercents:values.length,values}};
  }
  const data={...best,provider:'grok',updatedAt:Date.now(),version:2,readerVersion:'1.6.7'};
  await chrome.storage.local.set({usage2_grok:data});return data;
 }catch{return null;}
}
async function updateProvider(id){
 let temporary;
 let lastData=null;
 try{
  temporary=await chrome.tabs.create({url:CONFIG[id].url,active:false});
  if(id==='claude')await delay(5000);
  for(let attempt=0;attempt<4;attempt++){
   const deadline=Date.now()+12000;
   while(Date.now()<deadline){
   const tab=await chrome.tabs.get(temporary.id);
   if(tab.status==='complete'){
    const data=await bounded(id==='grok'?readGrokFrames(temporary.id):readTab(temporary.id),3500,null);
    if(data)lastData=data;
    if(id==='claude'?['current','weekly'].every(key=>data?.metrics?.some(metric=>metric.id===key)):data?.metrics?.length)return {state:'updated',data};
   }
    await delay(650);
   }
   if(attempt<3)await chrome.tabs.reload(temporary.id);
  }
  const detail=id==='grok'&&lastData?.readInfo?`（讀到的百分比 ${lastData.readInfo.values?.join('、')||'無'}）`:'';
  return {state:'needs_usage',message:id==='grok'?'Grok 暫時分頁未顯示完整用量'+detail:'官方用量頁尚未載入或無法辨識百分比'};
 }finally{
  if(temporary?.id)try{await chrome.tabs.remove(temporary.id);}catch{}
 }
}
const scanning=new Map();
function scanOne(id){
 if(scanning.has(id))return scanning.get(id);
 const task=(async()=>{
  let result;
  try{result=await bounded(updateProvider(id),58000,{state:'needs_usage',message:'讀取逾時，請再點低逃圖示'});}
  catch{result={state:'error',message:'讀取失敗，請再點低逃圖示'};}
  await chrome.storage.local.set({['scanStatus_'+id]:result});
 })().finally(()=>scanning.delete(id));
 scanning.set(id,task);return task;
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
 if(msg?.type!=='SCAN_VISIBLE')return;
 const selected=Array.isArray(msg.providers)?[...new Set(msg.providers)].filter(id=>Object.hasOwn(CONFIG,id)):[];
 Promise.allSettled(selected.map(scanOne)).then(()=>respond({complete:true}),()=>respond({complete:false}));
 return true;
});
chrome.runtime.onInstalled.addListener(()=>{chrome.storage.local.remove('refreshMinutes').catch(()=>{});});
