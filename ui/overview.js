(() => {
  globalThis.createArchiveOverview=({root,stage,cover,getPhotos,isBusy,onOpenLink})=>{
    const button=root.querySelector('[data-overview-toggle]'),panel=root.querySelector('#ar-overview'),gallery=panel.querySelector('.ar-overview-gallery'),hero=panel.querySelector('[data-overview-image]'),thumbs=panel.querySelector('[data-overview-thumbnails]');
    const pages=panel.querySelector('[data-overview-pages]'),short=panel.querySelector('[data-overview-short]'),long=panel.querySelector('[data-overview-long]'),nav=panel.querySelector('[data-overview-navigation]'),dots=panel.querySelector('[data-overview-dots]'),prev=panel.querySelector('[data-overview-prev]'),next=panel.querySelector('[data-overview-next]'),count=panel.querySelector('[data-overview-count]');
    const story=createArchiveStory({viewport:panel.querySelector('[data-story-viewport]'),flow:panel.querySelector('[data-story-flow]')}),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
    let photos=[],index=0,total=1,config=true,animation,touch,measureFrame;
    const isOpen=()=>!panel.hidden,isLong=()=>isOpen()&&index>0;
    function controls(){
      button.hidden=config||total<2;button.textContent=index?'짧은 소개':'긴 소개';button.setAttribute('aria-expanded',String(index>0));
      cover.setAttribute('aria-expanded',String(isOpen()));cover.setAttribute('aria-label',config?'설정':total<2?'짧은 소개':index===0?'긴 소개 보기':index===total-1?'짧은 소개 보기':'다음 소개 페이지');
      nav.hidden=config||total<2;prev.disabled=index===0;next.disabled=index===total-1;
      if(dots.children.length!==total){dots.replaceChildren(...Array.from({length:total},(_,page)=>{const dot=document.createElement('button');dot.type='button';dot.dataset.overviewPage=String(page);dot.setAttribute('aria-label',page===0?'짧은 소개':'긴 소개 '+page+'페이지');dot.addEventListener('click',()=>go(page));return dot;}));}
      const first=Math.max(0,Math.min(index-3,total-7));
      [...dots.children].forEach((dot,page)=>{dot.setAttribute('aria-current',page===index?'page':'false');dot.hidden=page<first||page>=first+7;});
      count.textContent=index===0?'짧은 소개 · 1 / '+total:'긴 소개 · '+(index+1)+' / '+total;
    }
    function go(page,animate=true){
      if(config||isBusy()&&animate)return;const active=document.activeElement,hadFocus=panel.contains(active),target=Math.max(0,Math.min(total-1,page)),delta=target-index;animation?.cancel();index=target;
      short.hidden=index>0;long.hidden=index===0;long.classList.remove('ar-overview-measuring');short.scrollTop=0;if(index)story.show(index-1);controls();
      if(hadFocus&&(!active.isConnected||active.closest('[hidden]')||active.closest('[inert]')))pages.focus({preventScroll:true});
      if(delta&&animate&&!reduced()&&pages.animate)animation=pages.animate([{opacity:0,transform:'translateX('+(Math.sign(delta)*26)+'px)'},{opacity:1,transform:'translateX(0)'}],{duration:360,easing:'cubic-bezier(.22,.7,.16,1)'});
    }
    function measure(){
      cancelAnimationFrame(measureFrame);if(config||!isOpen()||!pages.clientWidth)return;
      // Measure the body in place without moving the visible summary.
      long.hidden=false;long.classList.add('ar-overview-measuring');total=1+story.measure();go(Math.min(index,total-1),false);
    }
    function scheduleMeasure(){cancelAnimationFrame(measureFrame);measureFrame=requestAnimationFrame(measure);}
    function reset(){cancelAnimationFrame(measureFrame);animation?.cancel();index=0;total=1;config=true;stage.classList.remove('ar-overview-open');panel.hidden=true;}
    function choose(photoIndex){if(!photos[photoIndex])return;const photo=photos[photoIndex];hero.src=photo.src;hero.alt=photo.alt;[...thumbs.children].forEach((node,i)=>node.setAttribute('aria-pressed',String(i===photoIndex)));if(!reduced()&&hero.animate)hero.animate([{opacity:.35},{opacity:1}],{duration:220});}
    function render(record){
      animation?.cancel();index=0;total=1;config=record.kind==='SETTINGS';cover.tabIndex=config?-1:0;cover.setAttribute('role',config?'img':'button');stage.classList.toggle('ar-overview-open',!config);panel.hidden=config;
      if(config){controls();return;}
      panel.querySelector('.ar-overview-type').textContent=record.kind==='RESEARCH'?'탐구 보고서':'개발 프로젝트';const heading=panel.querySelector('h2');heading.textContent=record.title.replace(/\n/g,' ');heading.title=heading.textContent;ArchiveLinks.richText(panel.querySelector('.ar-overview-summary'),record.summary||'');ArchiveLinks.linkList(panel.querySelector('[data-overview-links]'),record.links,onOpenLink);
      photos=getPhotos(record);thumbs.replaceChildren();gallery.hidden=!photos.length;thumbs.hidden=photos.length<2;hero.removeAttribute('src');hero.alt='';
      photos.forEach((photo,photoIndex)=>{const thumb=document.createElement('button');thumb.type='button';thumb.className='cursor-interaction';thumb.setAttribute('aria-label','사진 '+(photoIndex+1));thumb.setAttribute('aria-pressed',String(photoIndex===0));const img=document.createElement('img');img.src=photo.src;img.alt='';thumb.append(img);thumb.addEventListener('click',()=>{if(!isBusy())choose(photoIndex);});thumbs.append(thumb);});if(photos.length)choose(0);
      story.render(record.body);short.hidden=false;short.scrollTop=0;long.hidden=true;long.classList.remove('ar-overview-measuring');controls();scheduleMeasure();
    }
    function advance(){if(!isBusy())go(index===total-1?0:index+1);}
    function summary(){go(0);}
    function toggle(){go(index?0:1);}
    button.addEventListener('click',toggle);prev.addEventListener('click',()=>go(index-1));next.addEventListener('click',()=>go(index+1));
    panel.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;if(event.target.closest('[data-overview-thumbnails]'))return;event.preventDefault();event.stopPropagation();go(event.key==='Home'?0:event.key==='End'?total-1:index+(event.key==='ArrowRight'?1:-1));});
    thumbs.addEventListener('keydown',event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();event.stopPropagation();if(isBusy())return;const current=[...thumbs.children].findIndex(node=>node.getAttribute('aria-pressed')==='true'),photoIndex=Math.max(0,Math.min(photos.length-1,current+(event.key==='ArrowRight'?1:-1)));choose(photoIndex);thumbs.children[photoIndex]?.focus({preventScroll:true});});
    pages.addEventListener('pointerdown',event=>{if(event.button||event.target.closest('a,button'))return;touch={x:event.clientX,y:event.clientY};});
    pages.addEventListener('pointerup',event=>{if(!touch)return;const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)go(index+(dx<0?1:-1));});pages.addEventListener('pointercancel',()=>touch=null);
    if(globalThis.ResizeObserver)new ResizeObserver(scheduleMeasure).observe(pages);addEventListener('resize',scheduleMeasure);document.fonts?.ready.then(scheduleMeasure);
    return{render,reset,advance,summary,toggle,isOpen,isLong};
  };
})();
