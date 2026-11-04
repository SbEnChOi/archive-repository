import {animate} from 'motion/mini';

export function createEntrance({root,animate,view=globalThis,media=matchMedia('(prefers-reduced-motion: reduce)')}){
 let state='idle',controls=[];const events=['pointerdown','wheel','keydown','focusin'];
 function finish(){if(state==='ready')return;state='ready';root.dataset.entry='ready';for(const control of controls)control.cancel();controls=[];events.forEach(type=>root.removeEventListener(type,finish,true));view.removeEventListener('resize',finish);view.removeEventListener('pagehide',finish);media.removeEventListener('change',changed);}
 function changed(){if(media.matches)finish();}
 function start(){
  if(state!=='idle')return;if(media.matches){finish();return;}
  state='running';root.dataset.entry='running';events.forEach(type=>root.addEventListener(type,finish,{capture:true,passive:true}));view.addEventListener('resize',finish,{once:true});view.addEventListener('pagehide',finish,{once:true});media.addEventListener('change',changed);
  try{
   const play=(node,frames,options)=>{if(node)controls.push(animate(node,frames,{ease:[.2,.75,.2,1],...options}));};
   play(root.querySelector('.ar-monogram'),{opacity:[0,1],translate:['0 -8px','0 0px']},{duration:.42});
   const books=[...root.querySelectorAll('.ar-shelf > .ar-book')].filter(book=>book.dataset.visible==='true');
   books.forEach(book=>play(book,{opacity:[0,1],translate:['0 72px','0 0px']},{duration:.76,delay:.04+Math.min(.22,Math.abs(Number(book.dataset.angle)||0)*.005)}));
   play(root.querySelector('.ar-collection-footer'),{opacity:[0,1],translate:['0 10px','0 0px']},{duration:.48,delay:.24});
   Promise.allSettled(controls.map(control=>Promise.resolve(control))).then(finish);
  }catch{finish();}
 }
 return{start,finish};
}
globalThis.createArchiveEntrance=({root})=>createEntrance({root,animate});
