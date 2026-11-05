import {animate as motionAnimate} from 'motion/mini';

export function createLoadGate({load,commit,pending,ready,failed,timeout=15000,setTimer=setTimeout,clearTimer=clearTimeout}){
 let generation=0;
 return{async run(){
  const ticket=++generation;let timer;pending();
  try{
   const result=await Promise.race([Promise.resolve().then(load),new Promise((_,reject)=>{timer=setTimer(()=>reject(Error('요청 시간이 초과됐어요.')),timeout);})]);
   if(ticket!==generation)return;clearTimer(timer);commit(result);await ready();
  }catch(error){if(ticket===generation)failed(error);}finally{clearTimer(timer);}
 }};
}

export function createArchiveStartup({root,onPrepare=()=>{},onReveal,onLoading=()=>{},onError=()=>{},animate=motionAnimate,media=matchMedia('(prefers-reduced-motion: reduce)')}){
 const surface=root.querySelector('[data-startup]'),mark=surface.querySelector('.ar-startup-mark'),line=surface.querySelector('.ar-startup-line'),logo=surface.querySelector('.ar-startup-logo'),errorPanel=surface.querySelector('[data-startup-error]'),retry=surface.querySelector('[data-startup-retry]'),status=surface.querySelector('[data-startup-status]');
 const content=[...root.children].filter(node=>node.matches('.ar-header,.ar-collection,.ar-detail,.ar-editor,.ar-peek,.ar-status'));
 let controls=[],revision=0,finishReveal=null,restoreFocus=false,run=()=>location.reload();
 function stop(){controls.forEach(control=>control.cancel());controls=[];}
 function pending(){revision++;stop();finishReveal=null;surface.hidden=false;root.dataset.startup='loading';content.forEach(node=>node.inert=true);errorPanel.hidden=true;retry.disabled=true;status.textContent='기록 불러오는 중';onLoading();}
 function failed(){revision++;stop();finishReveal=null;root.dataset.startup='error';surface.hidden=false;content.forEach(node=>node.inert=true);status.textContent='';errorPanel.hidden=false;retry.disabled=false;onError();}
 function reveal(){
  const ticket=++revision,from=getComputedStyle(line).transform,fromOpacity=Number(getComputedStyle(line).opacity);stop();onPrepare();root.dataset.startup='revealing';status.textContent='';
  return new Promise(resolve=>{
   const finish=()=>{if(ticket!==revision){resolve();return;}finishReveal=null;stop();surface.hidden=true;root.dataset.startup='ready';content.forEach(node=>node.inert=false);onReveal();if(restoreFocus){restoreFocus=false;(root.querySelector('.ar-detail:not([hidden]) [data-close]')||root.querySelector('.ar-header [data-home]'))?.focus({preventScroll:true});}resolve();};finishReveal=finish;
   if(media.matches){finish();return;}
   try{controls.push(animate(mark,{transform:['translateY(-16px)','translateY(-22px)']},{duration:.16,ease:[.2,.75,.2,1]}));controls.push(animate(line,{transform:[from==='none'?'scaleX(1)':from,'scale(1.035, 2)','scale(.005, 1)'],opacity:[fromOpacity,.7,0]},{delay:.16,duration:1.18,times:[0,.1496/1.18,1],ease:[[.55,0,.8,.3],[.55,0,.8,.3]]}));controls.push(animate(logo,{transform:['translateY(0) scale(1)','translateY(-6px) scale(.96)'],opacity:[1,0]},{duration:.24,delay:1.1,ease:[.4,0,1,1]}));controls.push(animate(surface,{opacity:[1,0]},{duration:.16,delay:1.34}));Promise.allSettled(controls.map(control=>Promise.resolve(control))).then(finish);}catch{finish();}
  });
 }
 retry.addEventListener('click',()=>{if(!retry.disabled){restoreFocus=true;run();}});surface.addEventListener('pointerdown',()=>finishReveal?.());media.addEventListener('change',()=>{if(media.matches)finishReveal?.();});
 pending();
 return{reveal,load(load,commit){const gate=createLoadGate({load,commit,pending,ready:reveal,failed});run=()=>gate.run();return run();},unavailable(){failed();}};
}
globalThis.createArchiveStartup=createArchiveStartup;
