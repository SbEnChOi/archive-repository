(() => {
  const icon='<span class="ar-folder-icon" aria-hidden="true"><i class="ar-folder-back"></i><i class="ar-folder-paper"></i><i class="ar-folder-front"></i></span>';
  globalThis.createArchiveFolders=({root,getFolders,getRecords,getActive,onActive,getNode,createBook,removeBook,canClick,canManage,onOpen,onCreate,onRename,onMove,onDelete,isBusy,setBusy,status,standalone})=>{
    const layer=root.querySelector('[data-folder-layer]'),empty=root.querySelector('[data-folder-empty]'),dialog=root.querySelector('[data-folder-dialog]'),form=dialog.querySelector('form'),name=form.elements.folderName,error=dialog.querySelector('[role=alert]'),bar=root.querySelector('[data-folder-current]');
    const nodes=new Map(),items=()=>getRecords().filter(record=>record.folderId===getActive()),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
    let editing=null,ghost,source,target,origin,pinned=null,leaveTimer,opened=null,returningFocus=false;
    const wheel=createArchiveWheel({root,shelf:layer,getBooks:items,getNodes:()=>nodes,getSpread:()=>9,standalone,upper:true,getAnchor:anchor,onDraw:syncCount});
    function anchor(){const node=getNode(getActive());if(!node)return null;const box=node.getBoundingClientRect(),base=root.getBoundingClientRect();return{x:box.left+box.width/2-base.left-root.clientWidth/2,top:box.top-base.top};}
    function syncCount(position=wheel?.position()||0){const total=items().length;root.querySelector('[data-folder-count]').textContent=total?(Math.round(position)+1)+' / '+total:'0 / 0';root.querySelector('[data-folder-prev]').disabled=position<=.001;root.querySelector('[data-folder-next]').disabled=position>=total-1-.001;}
    function clearBooks(){for(const [id,node] of nodes){removeBook(id,node);}nodes.clear();layer.replaceChildren();}
    function state(){
      const active=getActive(),folder=getFolders().find(folder=>folder.id===active);
      bar.hidden=!folder;root.querySelector('[data-folder-title]').textContent=folder?.title||'';root.querySelector('[data-folder-rename]').hidden=!canManage();root.querySelector('[data-folder-delete]').hidden=!canManage();root.querySelector('[data-folder-create]').hidden=!canManage();
      root.classList.toggle('ar-has-folders',getFolders().length>0);root.classList.toggle('ar-folder-open',Boolean(folder));
      for(const item of root.querySelectorAll('.ar-folder-book')){const expanded=item.dataset.folderTarget===active;item.setAttribute('aria-expanded',String(expanded));item.classList.toggle('ar-folder-expanded',expanded);}
    }
    function layout(){
      if(!getActive())return;const node=getNode(getActive()),visible=node&&!node.inert&&node.dataset.visible!=='false';layer.hidden=!visible||!nodes.size;empty.hidden=!visible||Boolean(nodes.size);bar.hidden=!visible;
      if(!visible)return;wheel.measure();const point=anchor();empty.style.left=(root.clientWidth/2+(point?.x||0))+'px';empty.style.top=Math.max(110,(point?.top||200)-70)+'px';
    }
    function open(id,pin=true,force=false){
      clearTimeout(leaveTimer);const folder=getFolders().find(folder=>folder.id===id);if(!folder){close();return;}if(pin)pinned=id;
      if(opened===id&&!force){state();layout();return;}
      clearBooks();opened=id;onActive(id);
      items().forEach((record,index)=>{const button=createBook(record,index);button.dataset.folderBook=id;nodes.set(record.id,button);layer.append(button);});
      state();wheel.set(Math.min(2,Math.max(0,items().length-1)),true);layout();
      if(!reduced())for(const [index,node] of [...nodes.values()].entries()){
        node.animate([{opacity:0},{opacity:1}],{duration:380,delay:Math.min(index*38,220),fill:'backwards'});
        node.querySelector('.ar-cover-inner')?.animate([{transform:'translateY(22px) scale(.9)'},{transform:'translateY(0) scale(1)'}],{duration:480,delay:Math.min(index*38,220),easing:'cubic-bezier(.22,.7,.16,1)'});
      }
    }
    function close(){clearTimeout(leaveTimer);const focus=document.activeElement,wasInside=layer.contains(focus)||bar.contains(focus),returnNode=getNode(getActive());pinned=null;opened=null;onActive(null);clearBooks();layer.hidden=true;empty.hidden=true;state();if(wasInside){returningFocus=true;try{returnNode?.focus({preventScroll:true});}finally{returningFocus=false;}}}
    function later(){clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{if(isBusy()||ghost)return;if(pinned&&opened!==pinned)open(pinned,false);else if(!pinned)close();},420);}
    function node(folder){
      const button=document.createElement('button');button.type='button';button.className='ar-book ar-folder-book cursor-interaction';button.dataset.id=folder.id;button.dataset.folderTarget=folder.id;button.setAttribute('aria-label',folder.title+', 폴더 열기');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','ar-folder-layer');
      button.innerHTML=icon;const title=document.createElement('span');title.className='ar-folder-name';title.textContent=folder.title;const amount=document.createElement('span');amount.className='ar-folder-amount';amount.textContent=String(getRecords().filter(record=>record.folderId===folder.id).length).padStart(2,'0');const label=document.createElement('span');label.className='ar-book-label';label.setAttribute('aria-hidden','true');const labelTitle=document.createElement('span'),labelKind=document.createElement('span');labelTitle.textContent=folder.title;labelKind.textContent='폴더';label.append(labelTitle,labelKind);button.append(title,amount,label);
      button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'&&!isBusy()&&!ghost)open(folder.id,false);});button.addEventListener('pointerleave',later);
      button.addEventListener('focus',()=>{if(!returningFocus&&button.matches(':focus-visible')&&!isBusy())open(folder.id,false);});button.addEventListener('blur',later);
      button.onclick=()=>{if(isBusy()||!canClick())return;if(pinned===folder.id)close();else onOpen(folder.id);};return button;
    }
    function render(){if(!getFolders().some(folder=>folder.id===pinned))pinned=null;const id=getActive();if(id&&getFolders().some(folder=>folder.id===id))open(id,true,true);else close();state();}
    function navigate(delta){if(!isBusy()&&getActive()){pinned=getActive();const focused=document.activeElement?.closest('[data-folder-book]'),list=items(),from=focused?list.findIndex(record=>record.id===focused.dataset.id):Math.round(wheel.target()),index=Math.max(0,Math.min(list.length-1,from+delta));wheel.set(index);if(focused){const next=nodes.get(list[index]?.id);if(next?.inert)wheel.set(index,true);next?.focus({preventScroll:true});}syncCount(index);}}
    function focusBook(id){const index=items().findIndex(record=>record.id===id);if(index>=0){pinned=getActive();wheel.set(index,true);layout();}}
    layer.id='ar-folder-layer';layer.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));layer.addEventListener('pointerleave',later);bar.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));bar.addEventListener('pointerleave',later);
    layer.addEventListener('wheel',event=>{if(isBusy()||event.ctrlKey)return;event.preventDefault();event.stopPropagation();pinned=getActive();const unit=event.deltaMode===1?16:event.deltaMode===2?layer.clientHeight:1;wheel.scroll((Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*unit);},{passive:false});
    layer.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();navigate(event.key==='ArrowRight'?1:-1);});
    function edit(folder){if(isBusy()||!canManage())return;editing=folder?.id||null;dialog.querySelector('h2').textContent=folder?'폴더 이름 변경':'폴더 만들기';name.value=folder?.title||'';error.textContent='';dialog.showModal();name.focus();}
    root.querySelector('[data-folder-create]').onclick=()=>edit();root.querySelector('[data-folder-back]').onclick=close;root.querySelector('[data-folder-prev]').onclick=()=>navigate(-1);root.querySelector('[data-folder-next]').onclick=()=>navigate(1);
    root.querySelector('[data-folder-rename]').onclick=()=>edit(getFolders().find(folder=>folder.id===getActive()));root.querySelector('[data-folder-delete]').onclick=()=>{const folder=getFolders().find(folder=>folder.id===getActive());if(folder&&!isBusy())onDelete(folder);};
    dialog.querySelector('[data-folder-cancel]').onclick=()=>dialog.close();dialog.addEventListener('keydown',event=>event.stopPropagation());
    form.onsubmit=async event=>{event.preventDefault();if(isBusy())return;const title=name.value.trim();if(!title)return;const button=form.querySelector('[type=submit]');button.disabled=true;setBusy(true);try{if(editing)await onRename(editing,title);else await onCreate(title);dialog.close();render();}catch(e){error.textContent=e.message;}finally{setBusy(false);button.disabled=false;}};
    function clearTarget(){target?.classList.remove('ar-folder-hover');target=null;}
    function cancel(){clearTarget();ghost?.remove();source?.classList.remove('ar-folder-drag-source');ghost=null;source=null;}
    function move(event,node){
      if(!ghost){source=node;origin=node.getBoundingClientRect();ghost=node.cloneNode(true);ghost.inert=true;ghost.removeAttribute('id');ghost.removeAttribute('data-id');ghost.className='ar-folder-drag-ghost';Object.assign(ghost.style,{width:origin.width+'px',height:origin.height+'px',background:node.style.getPropertyValue('--ar-cover'),left:origin.left+'px',top:origin.top+'px'});ghost.querySelector('.ar-book-label')?.remove();root.append(ghost);source.classList.add('ar-folder-drag-source');}
      ghost.style.left=event.clientX-origin.width/2+'px';ghost.style.top=event.clientY-origin.height*.45+'px';const hovered=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-folder-target]');
      if(hovered!==target){clearTarget();target=hovered;target?.classList.add('ar-folder-hover');if(target?.dataset.folderTarget)open(target.dataset.folderTarget,false);}
    }
    async function drop(event,record){
      const node=target,destination=node?.dataset.folderTarget||null;if(!record||!node||destination===(record.folderId||null)){cancel();return;}setBusy(true);let animation;
      try{const end=node.getBoundingClientRect(),box=ghost.getBoundingClientRect();if(!reduced())animation=ghost.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+(end.left+end.width/2-box.left-box.width/2)+'px,'+(end.top+end.height/2-box.top-box.height/2)+'px) scale(.16)',opacity:0}],{duration:360,easing:'cubic-bezier(.22,.7,.16,1)',fill:'forwards'});await onMove(record,destination);await animation?.finished.catch(()=>{});if(destination)open(destination,true);const visual=getNode(destination)?.querySelector('.ar-folder-icon');if(visual&&!reduced())visual.animate([{filter:'brightness(1)'},{filter:'brightness(1.18)'},{filter:'brightness(1)'}],{duration:300});}
      catch(e){status(e.message);}finally{animation?.cancel();cancel();setBusy(false);}
    }
    return{node,render,open,close,layout,navigate,focusBook,layer,move,drop,cancel,canDrag:()=>canManage()&&getFolders().length>0,freeze:()=>wheel.freeze(),position:()=>wheel.position(),spacing:()=>wheel.spacing(),drag:position=>wheel.drag(position),settle:position=>wheel.set(Math.round(position))};
  };
})();
