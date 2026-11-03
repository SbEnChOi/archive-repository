import {getDocument,GlobalWorkerOptions} from '/pdf.mjs';
GlobalWorkerOptions.workerSrc='/pdf.worker.mjs';
const query=new URLSearchParams(location.search),pages=document.querySelector('[data-pages]'),count=document.querySelector('[data-count]'),previous=document.querySelector('[data-prev]'),next=document.querySelector('[data-next]'),alert=document.querySelector('[role=alert]');
let documentPDF,currentPage=1,entries=[],queue=[],working=false,revision=0,activeTask,observer;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function updateCounter(){
  if(!entries.length)return;const top=document.querySelector('header').getBoundingClientRect().bottom+20;
  currentPage=(entries.find(entry=>entry.node.getBoundingClientRect().bottom>top)||entries.at(-1)).number;
  count.textContent=currentPage+' / '+documentPDF.numPages;previous.disabled=currentPage===1;next.disabled=currentPage===documentPDF.numPages;
}
function go(delta){entries[Math.max(0,Math.min(entries.length-1,currentPage-1+delta))]?.node.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});}
previous.onclick=()=>go(-1);next.onclick=()=>go(1);
addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();go(event.key==='ArrowLeft'?-1:1);}});
function schedule(entry){if(entry.drawn||entry.pending||entry.failed)return;entry.pending=true;queue.push(entry);pump();}
async function pump(){
  if(working)return;working=true;
  try{while(queue.length){const entry=queue.shift();entry.pending=false;if(!entry.near||entry.drawn)continue;const ticket=revision;
    try{const page=await documentPDF.getPage(entry.number);if(ticket!==revision)continue;
      const base=page.getViewport({scale:1}),width=entry.node.clientWidth,viewport=page.getViewport({scale:width/base.width}),ratio=Math.min(devicePixelRatio||1,2);
      entry.node.style.aspectRatio=base.width+' / '+base.height;entry.canvas.width=Math.floor(viewport.width*ratio);entry.canvas.height=Math.floor(viewport.height*ratio);
      activeTask=page.render({canvasContext:entry.canvas.getContext('2d'),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null});await activeTask.promise;activeTask=null;if(ticket!==revision)continue;
      if(!entry.text.textContent){const text=await page.getTextContent();entry.text.textContent=text.items.map(item=>item.str||'').join(' ');}
      if(ticket!==revision)continue;entry.drawn=true;entry.canvas.hidden=false;entry.label.hidden=true;entry.node.removeAttribute('aria-busy');
    }catch(error){if(error.name!=='RenderingCancelledException'){entry.failed=true;entry.label.textContent='페이지를 열 수 없습니다.';entry.node.removeAttribute('aria-busy');}}
  }}finally{working=false;}
}
function release(entry){if(entry.drawn){entry.drawn=false;entry.canvas.hidden=true;entry.canvas.width=1;entry.canvas.height=1;entry.label.hidden=false;entry.node.setAttribute('aria-busy','true');}}
let scrollFrame=0;addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateCounter();for(const entry of entries){const rect=entry.node.getBoundingClientRect();if(rect.bottom< -3000||rect.top>innerHeight+3000)release(entry);else if(entry.near&&!entry.drawn)schedule(entry);}});},{passive:true});
let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{revision++;activeTask?.cancel();for(const entry of entries){release(entry);if(entry.near)schedule(entry);}updateCounter();},150);});
try{
  const source=new URL(query.get('src')),cloudPath=/^\/functions\/v1\/archive-api\/files\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}$/.test(source.pathname),localPath=ARCHIVE_CONFIG.url===location.origin&&/^\/files\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}$/.test(source.pathname);if(source.origin!==ARCHIVE_CONFIG.url||!cloudPath&&!localPath)throw Error('Invalid source');
  const download=new URL(source);download.searchParams.set('download','1');document.querySelector('[data-download]').href=download.href;document.querySelector('.title').textContent=query.get('name')||'보고서';
  documentPDF=await getDocument({url:source.href,cMapUrl:'/cmaps/',cMapPacked:true,standardFontDataUrl:'/standard_fonts/',wasmUrl:'/wasm/',isEvalSupported:false}).promise;
  const first=await documentPDF.getPage(1),base=first.getViewport({scale:1});
  for(let number=1;number<=documentPDF.numPages;number++){
    const node=document.createElement('section');node.className='pdf-page';node.dataset.page=number;node.setAttribute('aria-label',number+' 페이지');node.setAttribute('aria-busy','true');node.style.aspectRatio=base.width+' / '+base.height;
    const canvas=document.createElement('canvas');canvas.hidden=true;canvas.setAttribute('aria-hidden','true');const label=document.createElement('span');label.className='page-label';label.textContent=number;const text=document.createElement('div');text.className='sr-only';node.append(canvas,label,text);pages.append(node);entries.push({number,node,canvas,label,text,near:false,drawn:false,pending:false,failed:false});
  }
  observer=new IntersectionObserver(changes=>{for(const change of changes){const entry=entries[Number(change.target.dataset.page)-1];entry.near=change.isIntersecting;if(entry.near)schedule(entry);}},{rootMargin:'1000px 0px'});entries.forEach(entry=>observer.observe(entry.node));alert.textContent='';updateCounter();
}catch{count.textContent='';alert.textContent='보고서를 열 수 없습니다. 새로고침 후 다시 시도해 주세요.';}
