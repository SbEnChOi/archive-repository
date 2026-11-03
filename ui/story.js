(() => {
  globalThis.createArchiveStory=({viewport,flow})=>{
    let index=0,total=0,unit=0,hasBody=false;
    function show(page){
      index=Math.max(0,Math.min(total-1,page));flow.style.transform='translateX('+(-index*unit)+'px)';
      const bounds=viewport.getBoundingClientRect(),intersects=node=>[...node.getClientRects()].some(rect=>rect.right>bounds.left+1&&rect.left<bounds.right-1&&rect.bottom>bounds.top&&rect.top<bounds.bottom);
      for(const paragraph of flow.children){const visible=intersects(paragraph);paragraph.inert=!visible;paragraph.setAttribute('aria-hidden',String(!visible));}
      for(const link of flow.querySelectorAll('a')){if(intersects(link))link.removeAttribute('tabindex');else link.tabIndex=-1;}
    }
    function render(body){
      hasBody=Boolean(body?.trim());index=0;total=0;flow.replaceChildren();flow.style.transform='none';
      if(hasBody)for(const part of body.split(/\n\s*\n/)){const paragraph=document.createElement('p');ArchiveLinks.richText(paragraph,part);flow.append(paragraph);}
    }
    function measure(){
      if(!hasBody){total=0;return total;}
      const width=viewport.clientWidth;if(!width||!viewport.clientHeight)return total;
      const gap=40;unit=width+gap;flow.style.setProperty('--ar-page-width',width+'px');flow.style.setProperty('--ar-page-gap',gap+'px');flow.style.transform='none';
      total=Math.max(1,Math.ceil((flow.scrollWidth-width-.5)/unit)+1);show(index);return total;
    }
    return{render,measure,show};
  };
})();
