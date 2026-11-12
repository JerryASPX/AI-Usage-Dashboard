const providers={chatgpt:{name:'ChatGPT',host:'chatgpt.com',url:'https://chatgpt.com/settings/usage?tab=overview',rows:[['five_hour','5 小時用量上限'],['weekly','每週上限']]},gemini:{name:'Gemini',host:'gemini.google.com',url:'https://gemini.google.com/usage',rows:[['current','目前用量'],['weekly','每週上限']]},grok:{name:'Grok',host:'grok.com',url:'https://grok.com/?_s=usage'},claude:{name:'Claude',host:'claude.ai',url:'https://claude.ai/settings/usage',rows:[['current','目前工作階段'],['weekly','每週用量']]}};
const el=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const icon=id=>{const i=el('img','provider-icon');i.src='icons/'+id+'.svg';i.alt='';return i;};
const pct=n=>Number(n.toFixed(1))+'%';
const kind=m=>m?.kind==='remaining'?'剩餘':m?.kind==='used'?'已使用':'官方比例';
let hidden=[];try{const h=JSON.parse(localStorage.getItem('hiddenProviders')||'[]');if(Array.isArray(h))hidden=h;}catch{}
chrome.storage.local.set({hiddenProviders:hidden}).catch(()=>{});
const visibleIds=()=>Object.keys(providers).filter(id=>!hidden.includes(id));
let scanRunning=false;
async function scanVisible(){
 const ids=visibleIds(),clock=document.getElementById('clock');
 if(!ids.length){clock.textContent='請先顯示至少一家 AI';return;}
 scanRunning=true;clock.textContent='正在查詢…';
 try{await chrome.runtime.sendMessage({type:'SCAN_VISIBLE',providers:ids});await paint();clock.textContent='查詢完成';}
 catch{clock.textContent='查詢失敗，請再點擴充功能圖示';}
 finally{scanRunning=false;}
}
function updateLayout(){const main=document.querySelector('main'),ids=visibleIds();for(let n=0;n<=4;n++)main.classList.toggle('count-'+n,ids.length===n);for(const id of Object.keys(providers))document.getElementById(id).classList.toggle('last-visible',id===ids.at(-1));}
for(const[id,p]of Object.entries(providers)){
 const toggle=document.querySelector(`[data-toggle="${id}"]`);toggle.replaceChildren(icon(id),el('span','provider-name',p.name),el('span','check','✓'));
 const card=document.getElementById(id),head=el('div','cardhead'),open=el('button','open','用量頁 ↗');head.append(icon(id),el('h2','',p.name),open);card.append(head,el('div','metrics'),el('div','status'));
 function visibility(){const shown=!hidden.includes(id);toggle.setAttribute('aria-pressed',String(shown));toggle.querySelector('.check').textContent=shown?'✓':'○';card.classList.toggle('hidden',!shown);}
 toggle.onclick=async()=>{const wasHidden=hidden.includes(id);hidden=wasHidden?hidden.filter(x=>x!==id):[...hidden,id];localStorage.setItem('hiddenProviders',JSON.stringify(hidden));visibility();updateLayout();await chrome.storage.local.set({hiddenProviders:hidden});};visibility();
 open.onclick=async()=>{const tabs=await chrome.tabs.query({url:'https://'+p.host+'/*'});const t=tabs.find(t=>/usage/.test(t.url));if(t){await chrome.tabs.update(t.id,{active:true});await chrome.windows.update(t.windowId,{focused:true});}else await chrome.tabs.create({url:p.url,active:true});window.close();};
}
updateLayout();
function track(value,label,cls='track'){const t=el('div',cls),fill=el('i','fill');if(Number.isFinite(value)){fill.style.width=value+'%';t.setAttribute('role','meter');t.setAttribute('aria-label',label);t.setAttribute('aria-valuemin','0');t.setAttribute('aria-valuemax','100');t.setAttribute('aria-valuenow',String(value));}else fill.style.width='0%';t.append(fill);return t;}
function render(id,data,result){
 const card=document.getElementById(id),area=card.querySelector('.metrics');area.replaceChildren();const current=data?.version===2&&(id!=='grok'||data.readerVersion==='1.6.7'||data.readerVersion==='1.6.6');const metrics=current?data.metrics||[]:[];
 if(id!=='grok'){
  const rows=[...providers[id].rows];if(id==='claude'&&metrics.some(m=>m.id==='fable'))rows.push(['fable','Fable']);for(const[key,label]of rows){const m=metrics.find(m=>m.id===key),row=el('div','quota'),top=el('div','quota-top');top.append(el('b','quota-label',label));const value=el('span','quota-value');value.append(el('small','',m?kind(m):'未讀取'),el('strong','',m?pct(m.value):'—'));top.append(value);row.append(top,track(m?.value,label),el('div','reset',m?.reset||'重設時間尚未讀取'));if(key==='fable'&&m?.note)row.append(el('div','reset',m.note));area.append(row);}
 }else{
  const total=metrics.find(m=>m.id==='total'),d=current?data?.distribution:null;
  const left=el('div','hero');left.append(el('b','','總使用量'));const circle=el('div','gauge');circle.style.setProperty('--progress',(total?.value||0)*3.6+'deg');if(d?.totalInferred)circle.title='由產品用量合計推算';circle.append(el('strong','',total?pct(total.value):'—'));left.append(circle);
  const right=el('div','distribution');right.append(el('b','distribution-title','用量分布'));
  if(d?.products?.length){
   for(const product of d.products){
    const row=el('div','product-row'),label=el('div','product-label');
    label.append(el('span','',product.label),el('strong','',pct(product.value)));
    row.append(label,track(product.value,product.label,'track product-track'));
    right.append(row);
   }
  }else right.append(el('p','empty',total?'產品項目尚未辨識':'開啟 Grok 使用情況以讀取'));
  const content=el('div','grok-body');content.append(left,right);area.append(content,el('div','reset grok-reset',total?.reset||'重設時間尚未讀取'));
 }
 const states={updated:'已讀取官方用量頁',page_read:'已讀取畫面；未重載',read:'已讀取畫面',needs_usage:'用量頁讀取失敗',error:'更新失敗'};
 const status=card.querySelector('.status');status.textContent=(result?.state==='needs_usage'&&result.message?result.message:(states[result?.state]||'上次紀錄'))+(metrics.length?' · '+new Date(data.updatedAt).toLocaleTimeString('zh-TW',{hour12:false}):' · 尚無數據');status.title=result?.message||'用量資料以官方頁面為準';
}
async function paint(){
 const state=await chrome.storage.local.get(null);
 for(const id of Object.keys(providers))render(id,state['usage2_'+id],state['scanStatus_'+id]);
 if(!scanRunning)document.getElementById('clock').textContent='開啟面板時自動查詢顯示項目';
}
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local')paint();});
paint().then(scanVisible);
