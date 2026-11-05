(() => {
  const root=document.getElementById('ar-preview'),$=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
  const seed=JSON.parse($('#ar-seed').textContent).map(record=>({...record,visibility:'public',links:[],attachments:[]}));
  const storage=globalThis.ArchiveRepository;
  const initial=globalThis.openai?.widgetState?.privateContent||{};
  let changes=initial.version===3?initial.changes||{}:{};
  let records=seed.filter(record=>!changes[record.id]?.deleted).map(record=>({...record,...changes[record.id]}));
  records.push(...Object.values(changes).filter(record=>record.id&&!record.id.startsWith('seed-')&&!record.deleted));
  let focusIndex=Math.min(3,records.length),selected=null,busy=false,mode=initial.mode==='inside'?'inside':'tab',owner=!storage,editing=null,editorReturn=null,deleteId=null,peekTimer,drag=null,suppressClick=0;
  const design={spread:8.2},bookNodes=new Map(),settings={id:'__settings',title:'설정',kind:'SETTINGS',color:'#8c8f94',summary:'',body:'',tags:[],links:[],attachments:[]};
  const collection=$('.ar-collection'),shelf=$('.ar-shelf'),detail=$('.ar-detail'),cover=$('.ar-detail-cover'),stage=$('.ar-cover-stage'),article=$('.ar-article'),viewer=$('.ar-viewer'),editor=$('.ar-editor'),form=$('[data-record-form]'),peek=$('.ar-peek'),confirm=$('.ar-confirm');
  let folders=Array.isArray(initial.folders)?initial.folders:[],activeFolder=null;
  const rootRecords=()=>records.filter(record=>!record.folderId||!folders.some(folder=>folder.id===record.folderId));
  const visibleRecords=()=>activeFolder?records.filter(record=>record.folderId===activeFolder):rootRecords();
  const collectionItems=()=>[...rootRecords(),...folders.map(folder=>({...folder,kind:'FOLDER'})),settings];
  const books=()=>[...visibleRecords(),settings],find=id=>id==='__settings'?settings:records.find(record=>record.id===id),kind=record=>record.kind==='SETTINGS'?'설정':record.kind==='RESEARCH'?'탐구 보고서':'개발 프로젝트';
  const wheel=createArchiveWheel({root,shelf,getBooks:collectionItems,getNodes:()=>bookNodes,getSpread:()=>design.spread,standalone:Boolean(storage),onDraw:()=>folderUI.layout()});
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches,mobile=()=>matchMedia('(max-width:640px)').matches;
  const overview=createArchiveOverview({root,stage,cover,setBusy,isBusy:()=>busy,onOpenLink:openLink,getPhotos:record=>storage?(record.attachments||[]).filter(file=>file.role==='intro').map(file=>({src:storage.fileUrl(record,file),alt:file.name})):record.samplePhotos||[]});
  const editorControls=createArchiveEditorControls({root,form,isBusy:()=>busy});
  const folderUI=createArchiveFolders({root,getFolders:()=>folders,getRecords:()=>records,getActive:()=>activeFolder,onActive:id=>activeFolder=id,getNode:id=>bookNodes.get(id),createBook:bookNode,removeBook:(id,node)=>{if(bookNodes.get(id)===node)bookNodes.delete(id);},standalone:Boolean(storage),canClick:()=>Date.now()>suppressClick,canManage:()=>owner,isBusy:()=>busy,setBusy,status,onOpen:openFolder,onCreate:createFolder,onRename:renameFolder,onMove:moveToFolder,onDelete:folder=>requestDelete(folder.id)});
  const documents=storage&&globalThis.createArchiveDocuments?createArchiveDocuments({root,storage,canManage:()=>owner,onSave:record=>{records=records.map(item=>item.id===record.id?record:item);if(selected===record.id)renderDetail(record.id);}}):null;
  const fileViewer=storage&&globalThis.createArchiveFileViewer?createArchiveFileViewer({root,storage}):null;
  const entrance=globalThis.createArchiveEntrance?.({root})||{prepare(){},start(){},finish(){}};
  const startup=createArchiveStartup({root,onPrepare:()=>{if(selected)entrance.finish();else entrance.prepare();},onReveal:()=>{if(selected)entrance.finish();else entrance.start();},onLoading:()=>setBusy(true),onError:()=>setBusy(false)});
  let photoFiles=[],removedPhotoIds=new Set(),photoURLs=[];
  function status(message=''){ $('.ar-status').textContent=message; }
  function setBusy(value){busy=value;root.setAttribute('aria-busy',String(value));}
  async function persist(nextChanges=changes){
    if(storage)return;
    const snapshot={version:3,changes:nextChanges,mode,folders};
    if(new TextEncoder().encode(JSON.stringify(snapshot)).length>14500)throw new Error('기록이 길어 미리보기에 저장할 수 없습니다. 실행 사이트에서 저장해 주세요.');
    if(globalThis.openai?.setWidgetState)await globalThis.openai.setWidgetState({modelContent:{selectedRecord:selected?find(selected)?.title?.replace(/\n/g,' '):null,recordCount:records.length,openMode:mode},privateContent:snapshot});
  }
  function coverMarkup(record,index){
    const config=record.kind==='SETTINGS',number=config?'':String(record.number||'').trim(),label=number||String(index+1).padStart(2,'0');
    return '<div class="ar-cover-inner"><div class="ar-cover-top"><span>'+esc(config?'SETTINGS':record.kind)+'<br>ARCHIVE REPOSITORY</span><span>'+esc(label)+'</span></div><div class="ar-book-title'+(/[가-힣]/.test(record.title)?' ar-korean':'')+'">'+esc(record.title)+'</div>'+(config?'<span class="ar-gear" aria-hidden="true">⚙️</span>':'')+'<div class="ar-cover-bottom"><span class="ar-book-number">'+(config?'설정':esc(label))+'</span><span class="ar-book-note">'+esc(record.tags?.slice(0,2).join('\n').toUpperCase()||record.kind)+'</span></div></div>';
  }
  function hidePeek(){clearTimeout(peekTimer);peek.hidden=true;}
  function preview(record,button){
    hidePeek();if(record.kind==='SETTINGS'||busy||selected||mobile())return;
    peekTimer=setTimeout(()=>{
      if(selected||drag||!button.isConnected)return;
      const pos=button.getBoundingClientRect(),base=root.getBoundingClientRect();
      peek.innerHTML='<div class="ar-peek-cover" style="background:'+record.color+'">'+(record.kind==='RESEARCH'?'↗':'⌘')+'</div><div><strong>'+esc(record.title.replace(/\n/g,' '))+'</strong><small>'+esc(kind(record))+'</small><p>'+esc(record.summary||record.body.slice(0,110))+'</p></div>';
      peek.style.left=Math.max(12,Math.min(root.clientWidth-292,pos.left-base.left+60))+'px';peek.style.top=Math.max(100,pos.top-base.top-160)+'px';peek.hidden=false;
    },420);
  }
  function bookNode(record,index){
      const button=document.createElement('button');button.type='button';button.className='ar-book cursor-interaction'+(record.kind==='SETTINGS'?' ar-settings-cover':'');button.dataset.id=record.id;button.style.setProperty('--ar-cover',record.color);button.setAttribute('aria-label',record.title.replace(/\n/g,' ')+', '+kind(record)+' 열기');button.innerHTML=coverMarkup(record,index);
      const label=document.createElement('span');label.className='ar-book-label';label.setAttribute('aria-hidden','true');label.innerHTML='<span>'+esc(record.title.replace(/\n/g,' '))+'</span>'+(record.kind==='SETTINGS'?'':'<span>'+esc(kind(record))+'</span>');button.prepend(label);
      button.addEventListener('click',()=>{if(Date.now()>suppressClick&&!busy)openRecord(record.id);});button.addEventListener('mouseenter',()=>preview(record,button));button.addEventListener('mouseleave',hidePeek);button.addEventListener('focus',()=>{if(button.matches(':focus-visible'))preview(record,button);});button.addEventListener('blur',hidePeek);
      bookNodes.set(record.id,button);return button;
  }
  function renderCollection(){
    hidePeek();bookNodes.clear();shelf.replaceChildren();
    collectionItems().forEach((record,index)=>{const button=record.kind==='FOLDER'?folderUI.node(record):bookNode(record,index);shelf.append(button);bookNodes.set(record.id,button);});
    setFocus(focusIndex,0,true);updateOwner();folderUI.render();
  }
  function openFolder(id){if(busy)return;if(!id){folderUI.close();return;}const index=collectionItems().findIndex(item=>item.id===id);if(index>=0&&bookNodes.get(id)?.inert)setFocus(index,0,true);folderUI.open(id,true);}
  async function createFolder(title){const folder=storage?await storage.createFolder(title):{id:'folder-'+crypto.randomUUID(),title};folders.push(folder);await persist();focusIndex=collectionItems().findIndex(item=>item.id===folder.id);renderCollection();fit();folderUI.open(folder.id,true);}
  async function renameFolder(id,title){const folder=storage?await storage.renameFolder(id,title,folders.find(item=>item.id===id)?.version):{id,title};folders=folders.map(item=>item.id===id?folder:item);await persist();renderCollection();fit();}
  async function moveToFolder(record,folderId){const input={...record,folderId},saved=storage?await storage.update(record.id,input,[]):input;records=records.map(item=>item.id===record.id?saved:item);if(!storage){changes={...changes,[record.id]:saved};await persist();}renderCollection();fit();}
  function setFocus(index,transient=0,immediate=false){
    focusIndex=Math.max(0,Math.min(collectionItems().length-1,Math.round(index)));if(transient)wheel.drag(focusIndex+transient);else wheel.set(focusIndex,immediate);
    syncCollectionControls(focusIndex+transient);hidePeek();
  }
  function syncCollectionControls(position=focusIndex){focusIndex=Math.max(0,Math.min(collectionItems().length-1,Math.round(position)));$('[data-collection-count]').textContent=String(focusIndex+1).padStart(2,'0')+' / '+String(collectionItems().length).padStart(2,'0');$('[data-collection-prev]').disabled=position<=.001;$('[data-collection-next]').disabled=position>=collectionItems().length-1-.001;}
  function moveCollection(delta){if(!busy&&!selected&&editor.hidden){const bookFocused=document.activeElement?.classList.contains('ar-book');setFocus(focusIndex+delta);if(bookFocused){const next=bookNodes.get(collectionItems()[focusIndex].id);(next.inert?$('[data-collection-next]:not(:disabled),[data-collection-prev]:not(:disabled)'):next)?.focus({preventScroll:true});}persist().catch(()=>{});}}
  function fit(){wheel.measure();folderUI.layout();}
  function focusRecord(id){const record=find(id),folderId=folders.some(folder=>folder.id===record?.folderId)?record.folderId:null,index=collectionItems().findIndex(item=>item.id===(folderId||id));if(index>=0)setFocus(index,0,true);if(folderId)folderUI.focusBook(id);}
  function updateOwner(){$$('[data-add],[data-edit],[data-delete]').forEach(button=>button.hidden=!owner);$('[data-file-field]').hidden=!storage;$('[data-photo-field]').hidden=!storage;$('[data-photo-previews]').hidden=!storage;}
  function projectMode(record,link=record.links?.[0]){return link?.openMode||mode;}
  function defaultFile(record){return globalThis.ArchiveContent?.preferredAttachment(record)||null;}
  function updateMode(){$$('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));if(selected&&selected!=='__settings'){const record=find(selected),label=defaultFile(record)?ArchiveContent.primaryLabel(record):record.kind==='RESEARCH'?'보고서 읽기':projectMode(record)==='inside'?'프로젝트 열기':'프로젝트 열기 · 새 탭';$('[data-view]').textContent=label;$('[data-stage-open] span').textContent=label;}}
  function renderSettings(){
    const list=$('.ar-management-list');list.replaceChildren();records.forEach(record=>{const row=document.createElement('div');row.className='ar-management-row';const text=document.createElement('div');text.innerHTML='<strong>'+esc(record.title.replace(/\n/g,' '))+'</strong><small>'+esc(kind(record))+'</small>';const actions=document.createElement('div');if(owner){for(const [label,action] of [['수정',()=>openEditor(record.id)],['삭제',()=>requestDelete(record.id)]]){const button=document.createElement('button');button.type='button';button.className='cursor-interaction';button.textContent=label;button.addEventListener('click',action);actions.append(button);}}row.append(text,actions);list.append(row);});
  }
  function renderDetail(id){
    const record=find(id),index=books().findIndex(item=>item.id===id),config=id==='__settings';selected=id;cover.style.setProperty('--ar-cover',record.color);cover.classList.toggle('ar-settings-cover',config);cover.innerHTML=coverMarkup(record,index);
    fileViewer?.reset();overview.render(record);article.hidden=true;$('.ar-settings-content').hidden=!config;$('[data-stage-open]').hidden=config;$('.ar-detail-body').hidden=true;viewer.hidden=true;$('.ar-attachment-panel').hidden=true;$('[data-attachments]').setAttribute('aria-expanded','false');
    $('[data-record-prev]').disabled=index===0;$('[data-record-next]').disabled=index===books().length-1;
    if(config){renderSettings();updateMode();return;}
    $('.ar-detail-index').textContent=String(index+1).padStart(2,'0')+' / '+visibleRecords().length;$('.ar-detail-type').textContent=kind(record);$('.ar-detail-title').textContent=record.title.replace(/\n/g,' ');ArchiveLinks.richText($('.ar-detail-summary'),record.summary);ArchiveLinks.richText($('.ar-detail-body'),record.body);ArchiveLinks.linkList($('[data-detail-links]'),record.links,openLink);
    $('.ar-detail-tags').replaceChildren(...(record.tags||[]).map(tag=>{const span=document.createElement('span');span.textContent=tag;return span;}));
    const available=(record.attachments||[]).filter(file=>file.role!=='intro'),files=$('.ar-attachment-panel');files.replaceChildren(...available.map(file=>{const row=document.createElement('div');row.className='ar-attachment-row';const link=document.createElement('button');link.type='button';link.className='ar-attachment-open';link.textContent=typeof file==='string'?file:file.name;if(storage&&file.id)link.onclick=()=>showFile(record,file,true);row.append(link);if(owner&&documents?.editable(file)){const edit=document.createElement('button');edit.type='button';edit.className='ar-secondary';edit.textContent='편집';edit.setAttribute('aria-label',file.name+' 편집');edit.onclick=()=>documents.open(record,file);row.append(edit);}return row;}));
    $('[data-attachments]').hidden=!available.length;$('[data-share]').hidden=!owner||!record.shareUrl;const empty=Boolean(storage)&&!record.links?.length&&!available.length;$('[data-view]').disabled=empty;$('[data-stage-open]').disabled=empty;updateMode();updateOwner();const file=defaultFile(record);if(file&&fileViewer)showFile(record,file);
  }
  function finishMotion(target){const transition=target.style.transition;target.style.transition='none';target.style.visibility='';target.getBoundingClientRect();(selected?$('[data-close]'):target).focus({preventScroll:true});target.style.transition=transition;setBusy(false);}
  function flight(change,source,target,opening){
    if(busy)return;setBusy(true);hidePeek();
    const scale=Number((opening?source:target).dataset.scale)||1;
    const from=source.getBoundingClientRect(),sw=source.offsetWidth*(opening?scale:1),sh=source.offsetHeight*(opening?scale:1),oldHeight=stage.getBoundingClientRect().height,clone=cover.cloneNode(true),angle=Number((opening?source:target).dataset.angle)||0;
    const ghost=opening&&!reduced()?collection.cloneNode(true):null;if(ghost){ghost.classList.add('ar-motion-collection');ghost.inert=true;ghost.setAttribute('aria-hidden','true');ghost.querySelector('[data-id="'+source.dataset.id+'"]').style.visibility='hidden';}
    change();const to=target.getBoundingClientRect(),base=root.getBoundingClientRect(),tw=target.offsetWidth*(opening?1:scale),th=target.offsetHeight*(opening?1:scale);
    if(reduced()||!target.animate||!sw||!tw){finishMotion(target);return;}
    const w=opening?tw:sw,h=opening?th:sh;
    const matrix=(rect,width,height,deg)=>`translate(${rect.left-base.left+rect.width/2-w/2}px,${rect.top-base.top+rect.height/2-h/2}px) rotate(${deg}deg) scale(${width/w},${height/h})`;
    const start=matrix(from,sw,sh,opening?angle:0),end=matrix(to,tw,th,opening?0:angle);clone.classList.add('ar-flight');clone.setAttribute('aria-hidden','true');Object.assign(clone.style,{width:w+'px',height:h+'px',visibility:'visible',transform:start});target.style.visibility='hidden';if(ghost)root.append(ghost);root.append(clone);
    const ease='cubic-bezier(.22,.7,.16,1)',animations=[clone.animate(opening?[{transform:start,offset:0},{transform:start,offset:.26,easing:ease},{transform:end,offset:1}]:[{transform:start},{transform:end}],{duration:opening?1180:900,easing:opening?'linear':ease,fill:'both'})];
    const backdrop=document.createElement('div');backdrop.className='ar-flight-backdrop';backdrop.style.height=(opening?stage.getBoundingClientRect().height:oldHeight)+'px';root.append(backdrop);
    animations.push(backdrop.animate(opening?[{transform:'scaleX(0)'},{transform:'scaleX(1)'}]:[{transform:'scaleX(1)',offset:0},{transform:'scaleX(1)',offset:.55},{transform:'scaleX(0)',offset:1}],{duration:opening?470:950,easing:ease,fill:'both'}));
    Promise.allSettled(animations.map(animation=>animation.finished)).finally(()=>{clone.remove();ghost?.remove();backdrop.remove();animations.forEach(animation=>animation.cancel());finishMotion(target);});
  }
  function openRecord(id){
    entrance.finish();
    if(busy||!find(id))return;const record=find(id),position=wheel.freeze(),nearest=Math.round(position);setFocus(nearest,position-nearest);const folderId=folders.some(folder=>folder.id===record.folderId)?record.folderId:null;if(folderId){folderUI.open(folderId,true);if(bookNodes.get(folderId)?.inert)setFocus(collectionItems().findIndex(item=>item.id===folderId),0,true);}else folderUI.close();if(bookNodes.get(id)?.inert)focusRecord(id);if(!bookNodes.get(id))return;
    overview.reset();renderDetail(id);flight(()=>{collection.hidden=true;detail.hidden=false;editor.hidden=true;root.classList.add('ar-record-open');},bookNodes.get(id),cover,true);persist().catch(()=>{});
  }
  function closeRecord(){if(busy||!selected)return;const position=wheel.freeze(),nearest=Math.round(position);setFocus(nearest,position-nearest);const button=bookNodes.get(selected);if(!button)return;if(button.inert)focusRecord(selected);flight(()=>{overview.reset();fileViewer?.reset();detail.hidden=true;collection.hidden=false;root.classList.remove('ar-record-open');selected=null;viewer.hidden=true;fit();status();},cover,button,false);persist().catch(()=>{});}
  function navigateRecord(delta){
    if(busy||!selected)return;const index=books().findIndex(record=>record.id===selected),next=books()[index+delta];if(!next)return;hidePeek();setBusy(true);const old=cover.cloneNode(true);old.setAttribute('aria-hidden','true');old.classList.add('ar-flight');const pos=cover.getBoundingClientRect(),base=stage.getBoundingClientRect();Object.assign(old.style,{left:pos.left-base.left+'px',top:pos.top-base.top+'px',width:pos.width+'px',height:pos.height+'px'});stage.append(old);
    focusRecord(next.id);renderDetail(next.id);if(reduced()){old.remove();setBusy(false);return;}
    const distance=Math.min(250,root.clientWidth*.38),ease='cubic-bezier(.22,.7,.16,1)';
    const outgoing=old.animate([{transform:'translate(0,0) rotate(0deg)',opacity:1},{transform:`translate(${-delta*distance}px,75px) rotate(${-delta*18}deg) scale(.94)`,opacity:0}],{duration:630,easing:ease,fill:'both'});
    const incoming=cover.animate([{transform:`translate(${delta*distance}px,75px) rotate(${delta*18}deg) scale(.94)`,opacity:0},{transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1}],{duration:760,easing:ease,fill:'both'});
    Promise.allSettled([outgoing.finished,incoming.finished]).finally(()=>{old.remove();outgoing.cancel();incoming.cancel();setBusy(false);persist().catch(()=>{});});
  }
  function renderPrimaryField(value='auto'){
    const field=$('[data-primary-field]'),select=form.elements.primaryAttachment,existing=(editing?find(editing)?.attachments||[]:[]).filter(file=>file.role!=='intro'),picked=[...form.elements.files.files];
    select.replaceChildren();const auto=document.createElement('option');auto.value='auto';auto.textContent='자동 선택';select.append(auto);
    existing.forEach(file=>{const option=document.createElement('option');option.value='file:'+file.id;option.textContent=file.name;select.append(option);});
    picked.forEach((file,index)=>{const option=document.createElement('option');option.value='new:'+index;option.textContent='새 파일 · '+file.name;select.append(option);});
    select.value=[...select.options].some(option=>option.value===value)?value:'auto';field.hidden=!existing.length&&!picked.length;
  }
  function openEditor(id=null){
    if(!owner||busy)return;hidePeek();clearPhotoEditor();editing=id;editorReturn=selected;form.reset();$('.ar-form-error').textContent='';
    const record=id?find(id):{title:'',kind:'PROJECT',color:'#5142ad',visibility:'public',summary:'',body:'',links:[],attachments:[],number:'',primaryAttachmentId:null};
    for(const name of ['title','kind','color','visibility','number','summary','body'])form.elements[name].value=record[name]||'';
    form.elements.folderId.replaceChildren();const outside=document.createElement('option');outside.value='';outside.textContent='폴더 밖';form.elements.folderId.append(outside);folders.forEach(folder=>{const option=document.createElement('option');option.value=folder.id;option.textContent=folder.title;form.elements.folderId.append(option);});form.elements.folderId.value=id?(record.folderId||''):(activeFolder||'');
    editorControls.load(record);$('[data-editor-title]').textContent=id?'기록 수정':'새 기록';$('.ar-existing-files').replaceChildren(...(record.attachments||[]).filter(file=>file.role!=='intro').map(file=>{const row=document.createElement('div');row.textContent=file.name||file;return row;}));$('[data-picked-files]').replaceChildren();renderPrimaryField(record.primaryAttachmentId?'file:'+record.primaryAttachmentId:'auto');
    renderPhotoEditor();collection.hidden=true;detail.hidden=true;editor.hidden=false;root.classList.remove('ar-record-open');root.classList.add('ar-editor-open');renderEditorCover();editor.scrollIntoView({block:'start',behavior:'instant'});form.elements.title.focus({preventScroll:true});
  }
  function renderEditorCover(){if(editor.hidden)return;const record={title:form.elements.title.value||'Untitled',kind:form.elements.kind.value,color:form.elements.color.value,number:form.elements.number.value.trim(),tags:[]},preview=$('[data-editor-cover]');preview.style.setProperty('--ar-cover',record.color);preview.innerHTML=coverMarkup(record,editing?Math.max(0,records.findIndex(record=>record.id===editing)):records.length);$('[data-editor-meta]').textContent=kind(record)+' · '+form.elements.visibility.selectedOptions[0].textContent;}
  form.addEventListener('input',renderEditorCover);form.addEventListener('change',renderEditorCover);form.addEventListener('click',event=>{if(event.target.closest('[data-color]'))renderEditorCover();});form.elements.files.addEventListener('change',()=>{$('[data-picked-files]').replaceChildren(...[...form.elements.files.files].map(file=>{const row=document.createElement('span');row.textContent=file.name;return row;}));renderPrimaryField(form.elements.primaryAttachment.value);});
  function clearPhotoEditor(){photoURLs.forEach(url=>URL.revokeObjectURL(url));photoURLs=[];photoFiles=[];removedPhotoIds=new Set();$('[data-photo-previews]').replaceChildren();}
  function renderPhotoEditor(){
    photoURLs.forEach(url=>URL.revokeObjectURL(url));photoURLs=[];const list=$('[data-photo-previews]');list.replaceChildren();
    const existing=(editing?find(editing)?.attachments||[]:[]).filter(file=>file.role==='intro'&&!removedPhotoIds.has(file.id));
    const photos=[...existing.map(file=>({name:file.name,src:storage.fileUrl(find(editing),file),id:file.id})),...photoFiles.map((file,index)=>{const src=URL.createObjectURL(file);photoURLs.push(src);return{name:file.name,src,index};})];
    photos.forEach(photo=>{const card=document.createElement('figure');card.className='ar-photo-card';const image=document.createElement('img');image.src=photo.src;image.alt=photo.name;const caption=document.createElement('figcaption');caption.textContent=photo.name;const remove=document.createElement('button');remove.type='button';remove.className='cursor-interaction';remove.setAttribute('aria-label',photo.name+' 사진 삭제');remove.textContent='×';remove.addEventListener('click',()=>{if(busy)return;if(photo.id)removedPhotoIds.add(photo.id);else photoFiles.splice(photo.index,1);renderPhotoEditor();});card.append(image,caption,remove);list.append(card);});
  }
  form.elements.photos.addEventListener('change',()=>{if(busy){form.elements.photos.value='';return;}const picked=[...form.elements.photos.files],existing=(editing?find(editing)?.attachments||[]:[]).filter(file=>file.role==='intro'&&!removedPhotoIds.has(file.id));if(existing.length+photoFiles.length+picked.length>8){$('.ar-form-error').textContent='소개 사진은 8장까지 넣을 수 있습니다.';}else{photoFiles.push(...picked);$('.ar-form-error').textContent='';renderPhotoEditor();}form.elements.photos.value='';});
  function lockEditor(locked){[...form.elements].forEach(element=>element.disabled=locked);if(!locked)$('[data-link-add]').disabled=$('[data-link-rows]').children.length>=10;}
  function cancelEditor(){if(busy)return;clearPhotoEditor();editor.hidden=true;root.classList.remove('ar-editor-open');if(editorReturn&&find(editorReturn)){renderDetail(editorReturn);detail.hidden=false;root.classList.add('ar-record-open');detail.scrollIntoView({block:'start',behavior:'instant'});}else{selected=null;collection.hidden=false;root.classList.remove('ar-record-open');}editing=null;}
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!owner||busy)return;const button=$('[data-save]');$('.ar-form-error').textContent='';
    try{
      const title=form.elements.title.value.trim(),links=editorControls.read();if(!title)throw new Error('제목을 입력해 주세요.');
      const files=[...form.elements.files.files];if([...files,...photoFiles].reduce((sum,file)=>sum+file.size,0)>50*1024*1024)throw new Error('한 번에 50 MB까지 첨부할 수 있습니다.');
      const editingId=editing,previous=editingId?find(editingId):null,selection=form.elements.primaryAttachment.value||'auto',primaryAttachmentId=selection.startsWith('file:')?selection.slice(5):null,newPrimary=selection.startsWith('new:')?Number(selection.slice(4)):null;
      const input={id:editingId||'record-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)),title,kind:form.elements.kind.value,folderId:form.elements.folderId.value||null,color:form.elements.color.value,visibility:form.elements.visibility.value,number:form.elements.number.value.trim(),primaryAttachmentId,summary:form.elements.summary.value.trim(),body:form.elements.body.value.trim(),version:previous?.version,tags:previous?.tags||[],links,attachments:previous?.attachments||[],removePhotoIds:[...removedPhotoIds]};
      setBusy(true);lockEditor(true);button.textContent='저장 중';let savedRecord;
      if(storage)savedRecord=editingId?await storage.update(editingId,input,files,photoFiles):await storage.create(input,files,photoFiles);
      else{savedRecord=input;const next={...changes,[input.id]:input};await persist(next);changes=next;}
      if(storage&&newPrimary!==null){const added=savedRecord.attachments.filter(file=>file.role!=='intro').slice((previous?.attachments||[]).filter(file=>file.role!=='intro').length),target=added[newPrimary];if(target)try{savedRecord=await storage.update(savedRecord.id,{...savedRecord,primaryAttachmentId:target.id},[]);}catch(error){$('.ar-form-error').textContent=error.message;}}
      if(editingId)records=records.map(record=>record.id===editingId?savedRecord:record);else records.push(savedRecord);
      clearPhotoEditor();editing=null;editor.hidden=true;selected=null;activeFolder=folders.some(folder=>folder.id===savedRecord.folderId)?savedRecord.folderId:null;collection.hidden=false;detail.hidden=true;root.classList.remove('ar-record-open','ar-editor-open');focusIndex=collectionItems().findIndex(record=>record.id===(activeFolder||savedRecord.id));renderCollection();setBusy(false);openRecord(savedRecord.id);
    }catch(error){$('.ar-form-error').textContent=error.message;setBusy(false);}finally{lockEditor(false);button.textContent='저장';}
  });
  function submitForm(){if(form.reportValidity())form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}
  $('[data-save]').addEventListener('click',submitForm);
  form.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&event.target.tagName==='INPUT'&&!['file','color'].includes(event.target.type)){event.preventDefault();submitForm();}});
  function requestDelete(id){if(!owner||!id||id==='__settings'||busy)return;deleteId=id;const folder=folders.find(folder=>folder.id===id);$('#ar-confirm-title').textContent=folder?'폴더 “'+folder.title+'” 삭제 · 책자는 유지':'“'+find(id).title.replace(/\n/g,' ')+'” 삭제';$('[data-delete-error]').textContent='';confirm.showModal();}
  $('[data-delete-cancel]').addEventListener('click',()=>{deleteId=null;confirm.close();});confirm.addEventListener('cancel',()=>deleteId=null);
  $('[data-delete-confirm]').addEventListener('click',async()=>{
    if(!deleteId||busy)return;const id=deleteId,button=$('[data-delete-confirm]');button.disabled=true;
    try{setBusy(true);const folder=folders.find(folder=>folder.id===id);if(folder){if(storage)await storage.removeFolder(id,folder.version);folders=folders.filter(folder=>folder.id!==id);records=records.map(record=>record.folderId===id?{...record,folderId:null}:record);if(activeFolder===id)activeFolder=null;await persist();deleteId=null;confirm.close();renderCollection();return;}if(storage)await storage.remove(id);else{const next={...changes};if(id.startsWith('seed-'))next[id]={deleted:true};else delete next[id];await persist(next);changes=next;}
      records=records.filter(record=>record.id!==id);deleteId=null;confirm.close();renderCollection();if(selected===id){overview.reset();selected=null;detail.hidden=true;collection.hidden=false;root.classList.remove('ar-record-open');}else if(selected)renderDetail(selected);status();
    }catch(error){$('[data-delete-error]').textContent=error.message;}finally{setBusy(false);button.disabled=false;}
  });
  function openLink(link){viewRecord(link);if(projectMode(find(selected),link)==='inside'&&!viewer.hidden)viewer.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});}
  function showFile(record,file,scroll=false){fileViewer?.open(record,file);if(scroll)viewer.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});}
  function viewRecord(link){
    if(busy||!selected||selected==='__settings')return;const original=find(selected),explicit=Boolean(link?.url),record=explicit?{...original,kind:'PROJECT',links:[link]}:original,pdf=(record.attachments||[]).find(file=>file.mime==='application/pdf');
    const preferred=defaultFile(original);if(!explicit&&preferred&&fileViewer){showFile(original,preferred,true);return;}const projectUrl=record.links?.length?(storage?.projectUrl?.(record)||record.links[0].url):null;
    if(record.kind==='PROJECT'&&projectUrl&&projectMode(record)==='tab'){globalThis.open(projectUrl,'_blank','noopener,noreferrer');return;}fileViewer?.reset();
    viewer.replaceChildren();viewer.hidden=false;
    if(storage){
      const file=pdf||(record.attachments||[]).find(file=>/^(image|video|audio)\//.test(file.mime)||file.mime?.startsWith('text/plain'))||record.attachments?.[0];
      if(record.kind==='PROJECT'&&projectUrl||file?.mime==='application/pdf'||file?.mime?.startsWith('text/plain')){const frame=document.createElement('iframe');frame.className='ar-live-frame';frame.title=record.title.replace(/\n/g,' ');frame.referrerPolicy='no-referrer';frame.src=record.kind==='PROJECT'&&projectUrl?projectUrl:(file.mime==='application/pdf'&&storage.viewerUrl?storage.viewerUrl(record,file):storage.fileUrl(record,file));if(record.kind==='PROJECT'&&projectUrl){frame.setAttribute('sandbox','allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-top-navigation-by-user-activation');const bar=document.createElement('div');bar.className='ar-viewer-bar';const name=document.createElement('span');name.textContent=new URL(projectUrl,location.href).hostname;const escape=document.createElement('a');escape.href=projectUrl;escape.target='_blank';escape.rel='noopener noreferrer';escape.textContent='새 탭에서 열기 ↗';bar.append(name,escape);viewer.append(bar);}viewer.append(frame);}
      else if(file&&/^(image|video|audio)\//.test(file.mime)){const media=document.createElement(file.mime.startsWith('image/')?'img':file.mime.startsWith('video/')?'video':'audio');media.className='ar-live-media';media.src=storage.fileUrl(record,file);if(media.tagName==='IMG')media.alt=file.name;else media.controls=true;viewer.append(media);}
      else if(file){const link=document.createElement('a');link.className='ar-file-download';link.href=storage.fileUrl(record,file);link.textContent=file.name;link.download=file.name;viewer.append(link);}else viewer.hidden=true;return;
    }
    if(record.kind==='RESEARCH'){
      let page=0;const pages=[['탐구 질문',record.summary],['탐구 과정',record.body],['기록',record.tags.join(' · ')]];
      function draw(){viewer.innerHTML='<div class="ar-viewer-bar"><span>'+esc(record.title.replace(/\n/g,' '))+'.pdf</span><div class="ar-reader-tools"><button type="button" class="cursor-interaction" data-page-prev aria-label="이전 페이지" '+(page===0?'disabled':'')+'>←</button><span>'+(page+1)+' / 3</span><button type="button" class="cursor-interaction" data-page-next aria-label="다음 페이지" '+(page===2?'disabled':'')+'>→</button></div></div><div class="ar-reader"><article class="ar-reader-paper"><span class="ar-eyebrow">RESEARCH REPORT</span><h4>'+esc(pages[page][0])+'</h4><p>'+esc(pages[page][1])+'</p><div class="ar-page-number">'+(page+1)+'</div></article></div>'; $('[data-page-prev]').onclick=()=>{if(page>0){page--;draw();}};$('[data-page-next]').onclick=()=>{if(page<2){page++;draw();}};}draw();
    }else viewer.innerHTML='<div class="ar-demo-web"><aside class="ar-demo-sidebar"><strong>'+esc(record.title.replace(/\n/g,' '))+'</strong><span>Workspace</span><span>Notes</span></aside><div class="ar-demo-content"><h4>'+esc(record.title.replace(/\n/g,' '))+'</h4><p>'+esc(record.summary)+'</p><div class="ar-demo-line">작업 기록</div><div class="ar-demo-line">다음 아이디어</div></div></div>';
  }
  $$('[data-add]').forEach(button=>button.addEventListener('click',()=>openEditor()));$('[data-cancel]').addEventListener('click',cancelEditor);$('[data-edit]').addEventListener('click',()=>openEditor(selected));$('[data-delete]').addEventListener('click',()=>requestDelete(selected));
  $('[data-close]').addEventListener('click',closeRecord);$('[data-home]').addEventListener('click',()=>{if(!editor.hidden)cancelEditor();else if(selected)closeRecord();else folderUI.close();});
  $('[data-settings]').addEventListener('click',()=>{if(busy)return;setFocus(collectionItems().length-1,0,true);collection.hidden=true;detail.hidden=false;editor.hidden=true;root.classList.add('ar-record-open');renderDetail('__settings');setBusy(false);$('[data-close]').focus({preventScroll:true});});
  $('[data-collection-prev]').addEventListener('click',()=>moveCollection(-1));$('[data-collection-next]').addEventListener('click',()=>moveCollection(1));$('[data-record-prev]').addEventListener('click',()=>navigateRecord(-1));$('[data-record-next]').addEventListener('click',()=>navigateRecord(1));
  $$('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;updateMode();if(storage)storage.setMode(mode);persist().catch(error=>status(error.message));}));
  $('[data-view]').addEventListener('click',()=>viewRecord());$('[data-stage-open]').addEventListener('click',()=>{viewRecord();if(!viewer.hidden)viewer.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});});$('[data-attachments]').addEventListener('click',()=>{const panel=$('.ar-attachment-panel');panel.hidden=!panel.hidden;$('[data-attachments]').setAttribute('aria-expanded',String(!panel.hidden));});
  cover.addEventListener('click',()=>{if(Date.now()>suppressClick&&!busy&&selected!=='__settings')overview.advance();});cover.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();if(!busy&&selected!=='__settings')overview.advance();}});
  $('[data-share]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(find(selected).shareUrl);status('링크 복사됨');}catch{status(find(selected).shareUrl);}});
  root.addEventListener('keydown',event=>{if(root.dataset.startup!=='ready')return;if(confirm.open||event.key==='Escape'&&event.target.matches?.('input[type=color]'))return;if(event.key==='Escape'){if(!editor.hidden)cancelEditor();else if(overview.isLong())overview.summary();else if(selected)closeRecord();else folderUI.close();return;}if(!editor.hidden||event.target.closest('.ar-viewer,.ar-document')||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const delta=event.key==='ArrowRight'?1:-1;if(selected)navigateRecord(delta);else moveCollection(delta);}});
  function dragStart(event){if(busy||!editor.hidden||event.button>0||event.target.closest('button:not(.ar-book),.ar-overview'))return;const upper=Boolean(event.target.closest('[data-folder-layer]')),position=upper?folderUI.freeze():wheel.freeze();drag={x:event.clientX,y:event.clientY,book:event.target.closest('.ar-book:not(.ar-folder-book)'),upper,lastX:event.clientX,time:performance.now(),velocity:0,position,pointer:event.pointerId,active:false,selected:Boolean(selected)};}
  function dragMove(event){if(!drag||event.pointerId!==drag.pointer)return;const dx=event.clientX-drag.x,now=performance.now();drag.velocity=drag.velocity*.45+(event.clientX-drag.lastX)/Math.max(8,now-drag.time)*.55;drag.lastX=event.clientX;drag.time=now;const dy=event.clientY-drag.y;if(!drag.selected&&drag.book&&drag.book.dataset.id!=='__settings'&&folderUI.canDrag()&&(drag.folderActive||Math.max(Math.abs(dy),Math.abs(dx))>12)){drag.folderActive=true;drag.active=true;hidePeek();event.currentTarget.setPointerCapture?.(event.pointerId);folderUI.move(event,drag.book);return;}if(Math.abs(dx)>9){drag.active=true;root.classList.add('ar-dragging');hidePeek();if(event.currentTarget.setPointerCapture)event.currentTarget.setPointerCapture(event.pointerId);if(!drag.selected){if(drag.upper)folderUI.drag(drag.position-dx/folderUI.spacing());else wheel.drag(drag.position-dx/wheel.spacing());}}}
  function dragEnd(event){if(!drag)return;const current=drag,dx=event.clientX-current.x;drag=null;root.classList.remove('ar-dragging');if(current.folderActive){suppressClick=Date.now()+500;folderUI.drop(event,find(current.book.dataset.id));return;}if(current.active){suppressClick=Date.now()+350;if(current.selected){if(Math.abs(dx)>38)navigateRecord(dx<0?1:-1);}else{const spacing=current.upper?folderUI.spacing():wheel.spacing(),momentum=performance.now()-current.time<100?Math.max(-3.5,Math.min(3.5,current.velocity*150/spacing)):0,position=Math.round(current.position-dx/spacing-momentum);if(current.upper)folderUI.settle(position);else setFocus(position);}}else if(!current.selected&&!current.upper)setFocus(focusIndex);}
  for(const target of [shelf,stage,folderUI.layer]){target.style.touchAction='pan-y';target.addEventListener('pointerdown',dragStart);target.addEventListener('pointermove',dragMove);target.addEventListener('pointerup',dragEnd);target.addEventListener('pointercancel',()=>{folderUI.cancel();drag=null;root.classList.remove('ar-dragging');setFocus(Math.round(wheel.position()));});}
  let wheelSaveTimer;shelf.addEventListener('wheel',event=>{if(busy||selected||!editor.hidden||event.ctrlKey)return;event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?shelf.clientHeight:1,delta=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*unit;syncCollectionControls(wheel.scroll(delta));hidePeek();clearTimeout(wheelSaveTimer);wheelSaveTimer=setTimeout(()=>persist().catch(()=>{}),180);},{passive:false});
  renderCollection();fit();updateMode();setBusy(Boolean(storage||root.dataset.repository));if(globalThis.ResizeObserver)new ResizeObserver(fit).observe(root);
  if(globalThis.Tweak){const tweak=new Tweak({container:root,onChange:()=>fit()});tweak.addSlider(design,'spread',{label:'책자 펼침 간격',min:7,max:9.5,step:.5,unit:'°'});}
  globalThis.addEventListener('resize',fit);
  globalThis.addEventListener('openai:set_globals',event=>{const incoming=event.detail?.globals?.widgetState?.privateContent;if(storage||busy||!editor.hidden||incoming?.version!==3)return;const incomingMode=incoming.mode==='tab'?'tab':'inside',incomingChanges=incoming.changes||{};if(JSON.stringify(changes)===JSON.stringify(incomingChanges)){mode=incomingMode;updateMode();return;}mode=incomingMode;changes=incomingChanges;records=seed.filter(record=>!changes[record.id]?.deleted).map(record=>({...record,...changes[record.id]}));records.push(...Object.values(changes).filter(record=>record.id&&!record.id.startsWith('seed-')&&!record.deleted));if(selected&&!find(selected)){selected=null;detail.hidden=true;collection.hidden=false;root.classList.remove('ar-record-open');}renderCollection();fit();if(selected)renderDetail(selected);updateMode();});
  if(storage)startup.load(()=>storage.load(),result=>{records=result.records;folders=result.folders||[];owner=result.owner;mode=storage.getMode();focusIndex=Math.min(3,records.length);renderCollection();fit();updateMode();setBusy(false);if(result.selectedId)entrance.finish();if(result.selectedId&&find(result.selectedId)){activeFolder=folders.some(folder=>folder.id===find(result.selectedId).folderId)?find(result.selectedId).folderId:null;renderCollection();focusRecord(result.selectedId);openRecord(result.selectedId);}});else if(root.dataset.repository)startup.unavailable();else{setBusy(false);startup.reveal();}
})();






