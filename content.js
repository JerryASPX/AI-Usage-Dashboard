(() => {
 if(globalThis.__aiUsageObserver)globalThis.__aiUsageObserver.disconnect();
 if(globalThis.__aiUsageListener)chrome.runtime.onMessage.removeListener(globalThis.__aiUsageListener);
 const provider=location.hostname==='grok.com'?'grok':location.hostname==='gemini.google.com'?'gemini':location.hostname==='claude.ai'?'claude':'chatgpt';
 const visible=e=>e&&(provider==='grok'||e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&!e.closest?.('[hidden],[aria-hidden="true"]');
 function renderedText(root){
  if(!document.createTreeWalker||!document.createRange)return root?.innerText||'';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),parts=[];let node,count=0;
  while((node=walker.nextNode())&&count++<4000){
   const p=node.parentElement;
   if(!p||!node.nodeValue?.trim()||p.closest('script,style,template,noscript,[hidden],[aria-hidden="true"]'))continue;
   if(getComputedStyle(p).visibility==='hidden'||getComputedStyle(p).display==='none')continue;
   parts.push(node.nodeValue.trim());
  }
  return parts.join(' ').slice(0,30000);
 }
 const isUsageURL=()=>/\/settings\/usage|\/usage\b|[?&]_s=usage\b/.test(location.href);
 function roots(){
  const panels=[...document.querySelectorAll('[role="dialog"],dialog,[role="tabpanel"]')].filter(visible);
  const candidates=panels.filter(e=>/usage|使用情況|用量|使用量|目前用量/i.test(e.innerText));
  if(isUsageURL()){
   candidates.push(document.querySelector('main'),document.body);
  }
  const h=[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].find(e=>visible(e)&&/^(usage|usage limits|使用情況|用量|用量限制|使用量|目前用量)$/i.test(e.innerText.trim()));
  if(h){let p=h.parentElement;for(let i=0;p&&p!==document.body&&i<6;i++,p=p.parentElement)if(/\d\s*[%％]/.test(p.innerText))candidates.push(p);}
  if(provider==='grok'){
   const titles=[...document.querySelectorAll('h1,h2,h3,h4,div,span,p')].filter(e=>visible(e)&&/^(usage|使用情況|使用情况)$/i.test((e.innerText||'').trim()));
   for(const title of titles){let p=title.parentElement;for(let i=0;p&&p!==document.body&&i<7;i++,p=p.parentElement)candidates.push(p);}
   const bodyText=document.body?.innerText||'';
   if(/使用情況|使用情况|weekly premium|premium limits|usage/i.test(bodyText)&&/\d+\s*[%％]/.test(bodyText))candidates.push(document.body);
  }
  return [...new Set(candidates.filter(e=>e&&visible(e)))];
 }
 function nestedTexts(){
  const out=[],seen=new Set();let shadows=0,frames=0;
  function visit(root,depth){
   if(!root||seen.has(root)||depth>3||seen.size>32)return;
   seen.add(root);
   const text=root.body?.innerText||root.innerText||'';
   const rendered=renderedText(root.body||root);
   if(text)out.push(text.slice(0,30000));if(rendered&&rendered!==text)out.push(rendered);
   for(const e of root.querySelectorAll?.('*')||[]){
    if(e.shadowRoot){shadows++;visit(e.shadowRoot,depth+1);}
    if(e.tagName==='IFRAME'){try{if(e.contentDocument){frames++;visit(e.contentDocument,depth+1);}}catch{}}
   }
  }
  visit(document,0);return {texts:out,shadows,frames};
 }
 async function read(){
  const saved=await chrome.storage.local.get('hiddenProviders');
  if(saved.hiddenProviders?.includes(provider))return {provider,metrics:[],state:'hidden',version:2,readerVersion:'1.6.7'};
  const candidates=roots();if(!candidates.length)return {provider,metrics:[],state:'open_usage',version:2};
  const parsed=candidates.flatMap(r=>(provider==='grok'?[r.innerText,renderedText(r)]:[r.innerText,r.textContent]).filter((s,i,a)=>typeof s==='string'&&s.trim()&&(i===0||s!==a[0])).map(s=>UsageParser.parseUsage(s,provider)));
  let nested={texts:[],shadows:0,frames:0};
  if(provider==='grok'&&!parsed.some(p=>p.metrics.length)){
   nested=nestedTexts();for(const sample of nested.texts)parsed.push(UsageParser.parseUsage(sample,provider));
  }
  if(!parsed.length)return {provider,metrics:[],state:'no_numbers',version:2,readerVersion:'1.6.7'};
  const rank=p=>p.metrics.length*10+(p.distribution?.products.length||0)+(p.distribution?.consistent?20:0);
  parsed.sort((a,b)=>rank(b)-rank(a));
  const readInfo=provider==='grok'?{visiblePercents:(renderedText(document.body)||'').match(/\d+(?:\.\d+)?\s*[%％]/g)?.length||0,shadows:nested.shadows,frames:nested.frames}:undefined;
  const data={...parsed[0],provider,updatedAt:Date.now(),version:2,readerVersion:'1.6.7',readInfo,usageURL:isUsageURL()?location.href:null};
  if(data.metrics.length)await chrome.storage.local.set({['usage2_'+provider]:data});
  return data;
 }
 globalThis.__aiUsageListener=(msg,sender,respond)=>{if(msg?.type==='READ_USAGE'){read().then(respond).catch(()=>respond({provider,metrics:[],state:'error',version:2}));return true;}};
 chrome.runtime.onMessage.addListener(globalThis.__aiUsageListener);
 let timer;globalThis.__aiUsageObserver=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>read().catch(()=>{}),500);});
 globalThis.__aiUsageObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true});read().catch(()=>{});
})();
