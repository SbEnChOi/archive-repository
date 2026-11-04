import test from 'node:test';
import assert from 'node:assert/strict';
import {createEntrance} from '../ui/motion.js';
function fixture(reduced=false){
 const root=new EventTarget(),view=new EventTarget(),media=new EventTarget();media.matches=reduced;root.dataset={};const book={dataset:{visible:'true',angle:'0'}},logo={},footer={};root.querySelectorAll=()=>[book];root.querySelector=selector=>selector==='.ar-monogram'?logo:footer;
 const calls=[];const animate=(target,frames,options)=>{let resolve;const promise=new Promise(r=>resolve=r);const control={then:promise.then.bind(promise),cancelled:false,cancel(){this.cancelled=true;resolve();}};calls.push({target,frames,options,control});return control;};
 return{root,view,media,calls,entry:createEntrance({root,view,media,animate})};
}
test('entry runs once after readiness and does not overwrite wheel transforms',()=>{const f=fixture();f.entry.start();f.entry.start();assert.equal(f.calls.length,3);assert.equal(f.root.dataset.entry,'running');for(const call of f.calls)assert.ok(!('transform' in call.frames));f.entry.finish();assert.equal(f.root.dataset.entry,'ready');assert.ok(f.calls.every(c=>c.control.cancelled));});
test('early pointer/wheel/key input finishes the reveal synchronously',()=>{for(const type of ['pointerdown','wheel','keydown','focusin']){const f=fixture();f.entry.start();f.root.dispatchEvent(new Event(type));assert.equal(f.root.dataset.entry,'ready');assert.ok(f.calls.every(c=>c.control.cancelled));}});
test('reduced motion, direct routes and reduced-motion changes show the final state',()=>{const f=fixture(true);f.entry.start();assert.equal(f.calls.length,0);assert.equal(f.root.dataset.entry,'ready');const deep=fixture();deep.entry.finish();deep.entry.start();assert.equal(deep.calls.length,0);const live=fixture();live.entry.start();live.media.matches=true;live.media.dispatchEvent(new Event('change'));assert.equal(live.root.dataset.entry,'ready');});
test('resize and animation failures leave visible, usable content',()=>{const f=fixture();f.entry.start();f.view.dispatchEvent(new Event('resize'));assert.equal(f.root.dataset.entry,'ready');const broken=fixture();const entry=createEntrance({root:broken.root,view:broken.view,media:broken.media,animate(){throw Error('unavailable');}});assert.doesNotThrow(()=>entry.start());assert.equal(broken.root.dataset.entry,'ready');});
