import './startup.js';
import {animate} from 'motion/mini';

export function createEntrance({root,animate,view=globalThis,media=matchMedia('(prefers-reduced-motion: reduce)')}){
 let state='idle',controls=[],prepared=[];const events=['pointerdown','wheel','keydown','focusin'];
 function finish(){if(state==='ready')return;state='ready';root.dataset.entry='ready';for(const control of controls)control.cancel();controls=[];for(const {node,opacity,translate} of prepared){node.style.opacity=opacity;node.style.translate=translate;}prepared=[];events.forEach(type=>root.removeEventListener(type,finish,true));view.removeEventListener('resize',finish);view.removeEventListener('pagehide',finish);media.removeEventListener('change',changed);}
 function changed(){if(media.matches)finish();}
 function prepare(){
  if(state!=='idle')return;if(media.matches){finish();return;}
  state='prepared';root.dataset.entry='prepared';events.forEach(type=>root.addEventListener(type,finish,{capture:true,passive:true}));view.addEventListener('resize',finish,{once:true});view.addEventListener('pagehide',finish,{once:true});media.addEventListener('change',changed);
  try{
   const hold=(node,translate)=>{if(!node)return;prepared.push({node,opacity:node.style.opacity,translate:node.style.translate});node.style.opacity='0';node.style.translate=translate;};
   hold(root.querySelector('.ar-monogram'),'0 -8px');
   [...root.querySelectorAll('.ar-shelf > .ar-book')].filter(book=>book.dataset.visible==='true').forEach(book=>hold(book,'0 72px'));
   hold(root.querySelector('.ar-collection-footer'),'0 10px');
  }catch{finish();}
 }
 function start(){
  if(state==='idle')prepare();if(state!=='prepared')return;
  state='running';root.dataset.entry='running';
  try{
   const play=(node,frames,options)=>{if(node)controls.push(animate(node,frames,{ease:[.2,.75,.2,1],...options}));};
   play(root.querySelector('.ar-monogram'),{opacity:[0,1],translate:['0 -8px','0 0px']},{duration:.42});
   const books=[...root.querySelectorAll('.ar-shelf > .ar-book')].filter(book=>book.dataset.visible==='true');
   books.forEach(book=>play(book,{opacity:[0,1],translate:['0 72px','0 0px']},{duration:.76,delay:.04+Math.min(.22,Math.abs(Number(book.dataset.angle)||0)*.005)}));
   play(root.querySelector('.ar-collection-footer'),{opacity:[0,1],translate:['0 10px','0 0px']},{duration:.48,delay:.24});
   Promise.allSettled(controls.map(control=>Promise.resolve(control))).then(finish);
  }catch{finish();}
 }
 return{prepare,start,finish};
}
globalThis.createArchiveEntrance=({root})=>createEntrance({root,animate});
