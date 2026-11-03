import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {docxToHtml,sheetPreviews,slidePreviews} from './office-preview.js';
import {attachments,preferredAttachment,attachmentKind,primaryLabel,markdownReference} from './record-content.js';

const TEXT_LIMIT=5*1024*1024,OFFICE_LIMIT=10*1024*1024;
globalThis.ArchiveContent={attachments,preferredAttachment,attachmentKind,primaryLabel};
globalThis.createArchiveFileViewer=({root,storage})=>{
 const viewer=root.querySelector('.ar-viewer');let controller,revision=0;
 function reset(){revision++;controller?.abort();viewer.replaceChildren();viewer.hidden=true;delete viewer.dataset.fileId;}
 function markdown(target,text,record){
  const html=marked.parse(text,{gfm:true,breaks:false});target.innerHTML=DOMPurify.sanitize(html,{ALLOWED_TAGS:['h1','h2','h3','h4','h5','h6','p','br','hr','strong','em','del','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','a','img','details','summary','kbd','s','sup','sub'],ALLOWED_ATTR:['href','src','alt','title','start','align','open','colspan','rowspan','class']});
  for(const link of target.querySelectorAll('a')){const url=markdownReference(record,link.getAttribute('href'));if(!url)link.removeAttribute('href');else{link.href=url;link.target='_blank';link.rel='noopener noreferrer';}}
  for(const image of target.querySelectorAll('img')){const value=image.getAttribute('src')||'',local=attachments(record).find(file=>file.name===value.replace(/^\.\//,'')),url=local?storage.fileUrl(record,local):markdownReference(record,value,true);if(!url){image.replaceWith(document.createTextNode(image.alt||''));continue;}image.src=url;image.loading='lazy';image.referrerPolicy='no-referrer';}
  for(const block of target.querySelectorAll('pre,table'))block.tabIndex=0;
 }
 function word(target,html){
  target.innerHTML=DOMPurify.sanitize(html,{ALLOWED_TAGS:['h1','h2','h3','h4','h5','h6','p','br','hr','strong','em','del','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','a','img','s','sup','sub'],ALLOWED_ATTR:['href','src','alt','title','colspan','rowspan','align','class']});
  for(const link of target.querySelectorAll('a')){link.target='_blank';link.rel='noopener noreferrer';}
  for(const image of target.querySelectorAll('img')){image.loading='lazy';image.referrerPolicy='no-referrer';}
  for(const block of target.querySelectorAll('table'))block.tabIndex=0;
 }
 function sheet(target,previews){
  for(const preview of previews){
   const section=document.createElement('section'),title=document.createElement('h3');title.textContent=preview.name;section.append(title);
   if(!preview.rows.length){const empty=document.createElement('p');empty.className='ar-file-state';empty.textContent='표시할 셀이 없습니다.';section.append(empty);}
   else{const table=document.createElement('table');for(const row of preview.rows){const tr=document.createElement('tr');for(const cell of row){const td=document.createElement('td');td.textContent=cell;tr.append(td);}table.append(tr);}table.tabIndex=0;section.append(table);}
   if(preview.truncated){const note=document.createElement('p');note.className='ar-file-state';note.textContent='일부 내용만 표시합니다.';section.append(note);}
   target.append(section);
  }
 }
 function slides(target,previews){
  for(const preview of previews){
   const section=document.createElement('section'),title=document.createElement('h3');title.textContent='슬라이드 '+preview.number;section.append(title);
   for(const text of preview.paragraphs){const paragraph=document.createElement('p');paragraph.textContent=text;section.append(paragraph);}
   if(!preview.paragraphs.length){const empty=document.createElement('p');empty.className='ar-file-state';empty.textContent='표시할 텍스트가 없습니다.';section.append(empty);}
   target.append(section);
  }
 }
 async function download(url,signal,limit){
  const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok)throw Error('파일을 열 수 없습니다.');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error((limit>=OFFICE_LIMIT?'10 MB':'5 MB')+'보다 큰 파일은 다운로드로 열어 주세요.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }
 async function open(record,file){
  const ticket=++revision;controller?.abort();controller=new AbortController();const type=attachmentKind(file),url=storage.fileUrl(record,file);viewer.hidden=false;viewer.replaceChildren();viewer.dataset.fileId=file.id;
  const bar=document.createElement('div');bar.className='ar-viewer-bar ar-file-bar';const files=attachments(record);
  if(files.length>1){const select=document.createElement('select');select.setAttribute('aria-label','읽을 첨부파일');for(const candidate of files){const option=document.createElement('option');option.value=candidate.id;option.textContent=candidate.name;select.append(option);}select.value=file.id;select.onchange=()=>open(record,files.find(item=>item.id===select.value));bar.append(select);}
  else{const name=document.createElement('span');name.className='ar-file-name';name.textContent=file.name;bar.append(name);}
  const downloadLink=document.createElement('a');const downloadUrl=new URL(url,location.href);downloadUrl.searchParams.set('download','1');downloadLink.href=downloadUrl.href;downloadLink.target='_blank';downloadLink.rel='noopener noreferrer';downloadLink.textContent='다운로드 ↗';bar.append(downloadLink);viewer.append(bar);
  if(type==='pdf'){const frame=document.createElement('iframe');frame.className='ar-live-frame ar-pdf-frame';frame.title=file.name;frame.referrerPolicy='no-referrer';frame.loading='lazy';frame.src=storage.viewerUrl(record,file);viewer.append(frame);return;}
  if(type==='media'){const media=document.createElement(file.mime.startsWith('image/')?'img':file.mime.startsWith('video/')?'video':'audio');media.className='ar-live-media';media.src=url;if(media.tagName==='IMG'){media.alt=file.name;media.loading='lazy';}else media.controls=true;viewer.append(media);return;}
  if(type==='download'){const link=document.createElement('a');link.className='ar-file-download';link.href=downloadLink.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=file.name+' ↓';viewer.append(link);return;}
  const office=['word','sheet','slides'].includes(type),body=document.createElement('article');body.className=type==='markdown'?'ar-markdown':type==='word'?'ar-markdown ar-word':type==='sheet'?'ar-sheet':type==='slides'?'ar-slides':'ar-text-document';body.setAttribute('aria-label',file.name);const state=document.createElement('p');state.className='ar-file-state';state.setAttribute('role','status');state.textContent='불러오는 중';body.append(state);viewer.append(body);
  try{
   const limit=office?OFFICE_LIMIT:TEXT_LIMIT;
   if(file.size>limit)throw Error((office?'10 MB':'5 MB')+'보다 큰 '+(office?'문서':'텍스트')+'는 다운로드로 열어 주세요.');
   const bytes=await download(url,controller.signal,limit);if(ticket!==revision)return;body.replaceChildren();
   if(type==='word')word(body,await docxToHtml(bytes));
   else if(type==='sheet')sheet(body,sheetPreviews(bytes));
   else if(type==='slides')slides(body,slidePreviews(bytes));
   else{const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',text=new TextDecoder(encoding).decode(bytes);if(type==='markdown')markdown(body,text,record);else{const pre=document.createElement('pre');pre.textContent=text;body.append(pre);}}
  }catch(error){if(ticket!==revision||error.name==='AbortError')return;state.textContent=error.message;state.setAttribute('role','alert');const retry=document.createElement('button');retry.type='button';retry.className='ar-secondary';retry.textContent='다시 시도';retry.onclick=()=>open(record,file);body.replaceChildren(state,retry);}
 }
 return{open,reset};
};
