import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../ui/wheel.js',import.meta.url),'utf8');
function fixture(upper){
 const context={matchMedia:()=>({matches:true}),innerHeight:800,cancelAnimationFrame(){}};
 runInNewContext(source,context);
 const node={style:{setProperty(){}},dataset:{},setAttribute(){}},shelf={style:{setProperty(){}},dataset:{}},root={clientWidth:1000,style:{setProperty(){}}};
 let anchor={x:0,top:400};
 const wheel=context.createArchiveWheel({root,shelf,getBooks:()=>[{id:'book'}],getNodes:()=>new Map([['book',node]]),getSpread:()=>8.2,standalone:false,upper,getAnchor:()=>anchor});
 return{wheel,node,setAnchor:x=>{anchor={x,top:400};}};
}
function horizontal(node){return Number(node.style.transform.match(/calc\(-50% \+ ([\d.-]+)px\)/)[1]);}

test('folder preview follows the folder beyond both sides of the collection',()=>{
 const f=fixture(true);
 for(const x of [0,350,600,-350,-600,0]){f.setAnchor(x);f.wheel.measure();assert.equal(horizontal(f.node),x);}
});
