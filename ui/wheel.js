(() => {
  globalThis.createArchiveWheel=({root,shelf,getBooks,getNodes,getSpread,standalone,upper=false,getAnchor=()=>null,onDraw=()=>{}})=>{
    let current=upper?0:3,target=current,frame=0,geometry;
    const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp=value=>Math.max(0,Math.min(getBooks().length-1,value));
    function draw(){
      if(!geometry)return;
      const {width,height,bookWidth,bookHeight,radius,top,step,anchorX=0}=geometry;
      getBooks().forEach((record,index)=>{
        const node=getNodes().get(record.id);if(!node)return;
        const offset=index-current,angle=offset*step,radians=angle*Math.PI/180,scale=Math.max(.68,1-Math.abs(offset)*.043);
        const x=anchorX+Math.sin(radians)*radius,y=top+radius*(1-Math.cos(radians));
        const visible=Math.abs(angle)<(upper?33:82)&&x+bookWidth> -width/2&&x-bookWidth<width/2&&y<height+bookHeight;
        node.style.transform=`translate(calc(-50% + ${x}px),${y}px) rotate(${angle}deg) scale(${scale})`;
        node.style.setProperty('--ar-z',String(100-Math.round(Math.abs(offset)*5)));node.dataset.angle=String(angle);node.dataset.scale=String(scale);node.dataset.visible=String(visible);node.inert=!visible;node.setAttribute('aria-hidden',String(!visible));
      });
      shelf.dataset.position=current.toFixed(4);onDraw(current);
    }
    function freeze(){cancelAnimationFrame(frame);frame=0;target=current;return current;}
    function set(index,immediate=false){
      target=clamp(index);cancelAnimationFrame(frame);frame=0;
      if(immediate||reduced()||Math.abs(target-current)<.002){current=target;draw();return;}
      const start=current,end=target,distance=Math.abs(end-start),duration=Math.min(1000,620+distance*35),time=performance.now();
      const tick=now=>{const t=Math.min(1,(now-time)/duration),ease=1-Math.pow(1-t,4);current=start+(end-start)*ease;draw();if(t<1)frame=requestAnimationFrame(tick);else{current=end;frame=0;draw();}};frame=requestAnimationFrame(tick);
    }
    function measure(){
      const width=root.clientWidth,mobile=width<=640,height=standalone?Math.max(520,Math.min(1080,innerHeight)):Math.max(mobile?600:620,Math.min(900,width*.625));
      const baseBookHeight=mobile?Math.min(202,width*.48):Math.min(310,height*.345),bookHeight=baseBookHeight*(upper ? .68 : 1),bookWidth=bookHeight*220/310;
      const radius=(mobile?Math.max(550,width*1.6):Math.max(700,width*.765))*(upper ? .9 : 1),step=upper?7:mobile?10.8:getSpread();
      const anchor=upper?getAnchor():null;geometry={width,height,bookWidth,bookHeight,radius,top:upper?Math.max(82,(anchor?.top??height*.445)-bookHeight-40):height*.445,step,anchorX:upper?Math.max(-width*.28,Math.min(width*.28,anchor?.x||0)):0};
      if(upper){shelf.style.setProperty('--ar-book-width',bookWidth+'px');shelf.style.setProperty('--ar-book-height',bookHeight+'px');current=clamp(current);target=clamp(target);draw();return;}
      root.style.setProperty('--ar-scene-height',height+'px');root.style.setProperty('--ar-scene-width',width+'px');root.style.setProperty('--ar-book-width',bookWidth+'px');root.style.setProperty('--ar-book-height',bookHeight+'px');root.style.setProperty('--ar-expanded-width',Math.min(510,height*.8*220/310,Math.max(150,width-116))+'px');root.style.setProperty('--ar-overview-cover-width',Math.min(420,width*.36,height*.64*220/310)+'px');
      current=clamp(current);target=clamp(target);draw();
    }
    const spacing=()=>geometry?geometry.radius*Math.sin(geometry.step*Math.PI/180):120;
    return{measure,set,scroll(pixels){freeze();current=clamp(current+pixels/Math.max(280,spacing()*2.6));target=current;draw();return current;},drag(position){freeze();current=clamp(position);target=current;draw();},freeze,position:()=>current,target:()=>target,spacing};
  };
})();
