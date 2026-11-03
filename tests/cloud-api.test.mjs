import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/archive-api/handler.js';

const origin='https://archive.example',pdf=new TextEncoder().encode('%PDF-1.4\ncontent');
const base={title:'탐구',kind:'RESEARCH',color:'#5142ad',visibility:'public',summary:'기록',body:'본문',links:[],tags:[]};
function setup(){
  const records=new Map(),uploads=new Map(),objects=new Map();let mails=0,clock=Date.now();
  const repo={
    async config(){return{owner_email:'owner@example.com',site_url:origin,origins:[origin]};},
    async list(){return [...records.values()];},async get(id){return records.get(id);},
    async folders(){return [...records.values()].filter(row=>row.document.kind==='FOLDER');},
    async addUpload(value){uploads.set(value.id,{...value,expires_at:new Date(clock+7200000).toISOString()});},
    async signUpload(path){return{token:path};},async uploads(ids){return ids.flatMap(id=>uploads.has(id)?[uploads.get(id)]:[]);},
    async cleanup(){},async copy(from,to){if(objects.has(to)||!objects.has(from))throw Error('copy');objects.set(to,objects.get(from).slice());},
    async info(path){return{size:objects.get(path)?.length};},async prefix(path){return objects.get(path)?.slice(0,16);},
    async commit(document,version,ids){if((records.get(document.id)?.version||0)!==version)throw{code:'40001'};const row={id:document.id,document,version:version+1};records.set(row.id,structuredClone(row));ids.forEach(id=>uploads.delete(id));return row;},
    async removeRecord(id){records.delete(id);},async removeObjects(paths){paths.forEach(path=>objects.delete(path));},
    async download(path,range,method){const bytes=objects.get(path);return new Response(method==='HEAD'?null:range?bytes.slice(0,5):bytes,{status:range?206:200,headers:{'Content-Length':String(range?5:bytes.length),...(range?{'Content-Range':'bytes 0-4/'+bytes.length}:{})}});},
    async sendLogin(){mails++;}
  };
  const handle=createHandler({repo,signingSecret:'test-signing-secret',now:()=>clock,authenticate:async header=>header==='Bearer owner'?{email:'owner@example.com',email_confirmed_at:'2026-10-21'}:header==='Bearer unverified'?{email:'owner@example.com'}:{email:'other@example.com',email_confirmed_at:'2026-10-21'}});
  async function call(path,method='GET',body,auth='owner',site=origin){const headers={Origin:site,...(auth?{Authorization:'Bearer '+auth}:{}),...(method==='GET'||method==='HEAD'?{}:{'Content-Type':'application/json','X-Archive-Request':'1'})};return handle(new Request(origin+'/functions/v1/archive-api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}));}
  async function create(visibility='public'){const response=await call('/records','POST',{record:{...base,visibility},uploadIds:[]});assert.equal(response.status,201);return response.json();}
  return{call,create,records,uploads,objects,get mails(){return mails;},advance(ms){clock+=ms;}};
}

test('only verified owner can mutate, only configured origin is accepted',async()=>{
  const s=setup();for(const auth of [null,'other','unverified'])assert.equal((await s.call('/records','POST',{record:base},auth)).status,401);
  assert.equal((await s.call('/records','POST',{record:base},'owner','https://attacker.example')).status,403);
  assert.equal((await s.call('/records','POST',{record:{...base,links:[{url:'javascript:alert(1)'}]}})).status,400);
  assert.equal((await s.call('/login','POST',{email:'other@example.com'},null)).status,403);
  assert.equal((await s.call('/login','POST',{email:'owner@example.com'},null)).status,200);assert.equal(s.mails,1);
});
test('Supabase gateway forwards the function-name prefix without functions/v1',async()=>{
  const repo={config:async()=>({origins:[]}),list:async()=>[],folders:async()=>[]};
  const handler=createHandler({repo,authenticate:async()=>null,signingSecret:'test'});
  const response=await handler(new Request(origin+'/archive-api/records'));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{owner:false,records:[],folders:[]});
});
test('named links and opening modes survive editing; invalid destinations are rejected',async()=>{
  const s=setup(),links=[{label:'웹사이트',url:'https://project.example/',openMode:'tab'},{label:'GitHub',url:'https://github.com/example/project'},{label:'데모',url:'https://demo.example/',openMode:'inside'}];
  const result=await s.call('/records','POST',{record:{...base,links}});assert.equal(result.status,201);const saved=await result.json();assert.deepEqual(saved.links,links);
  const updated=await s.call('/records/'+saved.id,'PUT',{version:saved.version,record:{...base,links:links.slice(0,2)}});assert.equal(updated.status,200);assert.deepEqual((await updated.json()).links,links.slice(0,2));
  for(const link of [null,{url:'javascript:alert(1)'},{url:'https://u:p@example.com'},{url:'https://example.com',openMode:'external'}])assert.equal((await s.call('/records','POST',{record:{...base,links:[link]}})).status,400);
  assert.equal((await s.call('/records','POST',{record:{...base,links:Array(11).fill(links[0])}})).status,400);
});
test('public, private, unlisted metadata is isolated; tokens never leak to visitors',async()=>{
  const s=setup(),pub=await s.create(),priv=await s.create('private'),link=await s.create('unlisted');
  const list=await (await s.call('/records','GET',undefined,null)).json();assert.equal(list.owner,false);assert.deepEqual(list.records.map(row=>row.id),[pub.id]);
  assert.equal((await s.call('/records/'+priv.id,'GET',undefined,null)).status,404);
  assert.equal((await s.call('/records/'+link.id,'GET',undefined,null)).status,404);
  const query=new URL(link.shareUrl).search,visible=await (await s.call('/records/'+link.id+query,'GET',undefined,null)).json();
  for(const key of ['fileTicket','shareToken','shareHash','shareUrl'])assert.equal(visible[key],undefined);
  const changed=await s.call('/records/'+link.id,'PUT',{record:{...base,visibility:'private'},version:link.version});assert.equal(changed.status,200);
  assert.equal((await s.call('/records/'+link.id+query,'GET',undefined,null)).status,404);
  const newer=await (await s.call('/records/'+link.id,'PUT',{record:{...base,visibility:'unlisted'},version:2})).json();assert.notEqual(newer.shareUrl,link.shareUrl);
});
test('direct uploads are size/signature checked, staged copies cannot modify committed original',async()=>{
  const s=setup(),up=await (await s.call('/uploads','POST',{files:[{name:'report.pdf',size:pdf.length,role:'attachment'}]})).json();const ticket=up.uploads[0];s.objects.set(ticket.path,pdf);
  const result=await s.call('/records','POST',{record:{...base,visibility:'private'},uploadIds:[ticket.id]});assert.equal(result.status,201);const saved=await result.json();assert.equal(saved.attachments[0].objectPath,undefined);
  const route='/files/'+saved.id+'/'+saved.attachments[0].id;assert.equal((await s.call(route,'GET',undefined,null)).status,404);
  const ownerRoute=route+'?ticket='+encodeURIComponent(saved.fileTicket);assert.equal((await s.call(ownerRoute,'GET',undefined,null)).status,200);
  assert.equal((await s.call(ownerRoute+'tampered','GET',undefined,null)).status,404);
  s.objects.set(ticket.path,new Uint8Array([0]));assert.equal(await (await s.call(ownerRoute,'GET',undefined,null)).text(),new TextDecoder().decode(pdf));
  const response=await s.call('/records/'+saved.id,'PUT',{record:{...base,visibility:'private'},version:saved.version});assert.equal(response.status,200);assert.equal((await s.call(ownerRoute,'GET',undefined,null)).status,404);
  const bad=await (await s.call('/uploads','POST',{files:[{name:'fake.png',size:3,role:'intro'}]})).json();s.objects.set(bad.uploads[0].path,new Uint8Array([1,2,3]));
  assert.equal((await s.call('/records','POST',{record:base,uploadIds:[bad.uploads[0].id]})).status,400);assert.equal(s.records.size,1);assert.equal([...s.objects.keys()].filter(path=>path.startsWith('records/')).length,1);
});
test('upload limits, stale writes, cross-record removal and delete authorization',async()=>{
  const s=setup(),saved=await s.create();
  assert.equal((await s.call('/uploads','POST',{files:[{name:'x.pdf',size:50*1024*1024+1,role:'attachment'}]})).status,400);
  assert.equal((await s.call('/uploads','POST',{files:Array.from({length:9},()=>({name:'x.png',size:8,role:'intro'}))})).status,400);
  assert.equal((await s.call('/records/'+saved.id,'PUT',{version:0,record:base})).status,409);
  assert.equal((await s.call('/records/'+saved.id,'PUT',{version:1,record:{...base,removePhotoIds:[crypto.randomUUID()]}})).status,400);
  assert.equal((await s.call('/records/'+saved.id,'DELETE',{version:1},null)).status,401);
  assert.equal((await s.call('/records/'+saved.id,'DELETE',{version:1})).status,200);assert.equal(s.records.size,0);
});
test('original PDFs support range/head; expired tickets and visibility changes deny requests',async()=>{
  const s=setup(),up=await (await s.call('/uploads','POST',{files:[{name:'report.pdf',size:pdf.length,role:'attachment'}]})).json();s.objects.set(up.uploads[0].path,pdf);
  const saved=await (await s.call('/records','POST',{record:base,uploadIds:[up.uploads[0].id]})).json(),route='/files/'+saved.id+'/'+saved.attachments[0].id;
  assert.equal((await s.call(route,'HEAD',undefined,null)).status,200);
  const priv=await (await s.call('/records/'+saved.id,'PUT',{record:{...base,visibility:'private'},version:1})).json();assert.equal((await s.call(route,'GET',undefined,null)).status,404);
  s.advance(12*3600000+1);assert.equal((await s.call(route+'?ticket='+priv.fileTicket,'GET',undefined,null)).status,404);
});
test('folders isolate private names, move books without changing access and keep books on removal',async()=>{
  const s=setup();assert.equal((await s.call('/folders','POST',{title:'분야'},null)).status,401);assert.equal((await s.call('/folders','POST',{title:''})).status,400);
  const folder=await(await s.call('/folders','POST',{title:'개발'})).json(),hidden=await(await s.call('/folders','POST',{title:'비공개 분야'})).json();
  const book=await(await s.call('/records','POST',{record:{...base,folderId:folder.id}})).json();assert.equal(book.folderId,folder.id);await s.call('/records','POST',{record:{...base,visibility:'private',folderId:hidden.id}});
  const list=await(await s.call('/records','GET',undefined,null)).json();assert.equal(list.records.length,1);assert.deepEqual(list.folders,[{id:folder.id,title:'개발'}]);
  assert.equal((await s.call('/records/'+folder.id,'GET',undefined,null)).status,404);assert.equal((await s.call('/folders/'+folder.id,'PUT',{title:'탐구',version:0})).status,409);
  const renamed=await(await s.call('/folders/'+folder.id,'PUT',{title:'탐구',version:folder.version})).json();assert.equal(renamed.title,'탐구');
  assert.equal((await s.call('/records/'+book.id,'PUT',{record:{...base,folderId:'missing'},version:book.version})).status,400);
  assert.equal((await s.call('/folders/'+folder.id,'DELETE',{version:renamed.version})).status,200);const after=await(await s.call('/records','GET',undefined,null)).json();assert.equal(after.records[0].id,book.id);assert.equal(after.records[0].folderId,null);assert.deepEqual(after.folders,[]);
});
test('document saves retain original and recent revisions; history bytes are owner-only and stale saves fail',async()=>{
  const s=setup();async function upload(text){const bytes=new TextEncoder().encode(text),up=await(await s.call('/uploads','POST',{files:[{name:'note.md',size:bytes.length,role:'attachment'}]})).json();s.objects.set(up.uploads[0].path,bytes);return up.uploads[0].id;}
  const first=await upload('original');let saved=await(await s.call('/records','POST',{record:base,uploadIds:[first]})).json();const fileId=saved.attachments[0].id,route='/files/'+saved.id+'/'+fileId;
  for(let n=1;n<=8;n++){const id=await upload('revision '+n),response=await s.call('/records/'+saved.id,'PUT',{record:base,version:saved.version,uploadIds:[id],replacements:[{fileId,uploadId:id}]});assert.equal(response.status,200);saved=await response.json();assert.equal(saved.attachments[0].id,fileId);}
  assert.equal(saved.attachments[0].revision,8);assert.equal(saved.attachments[0].history.length,5);assert.equal(saved.attachments[0].history[0].revision,0);assert.equal(s.objects.size,6);
  const publicRecord=await(await s.call('/records/'+saved.id,'GET',undefined,null)).json();assert.equal(publicRecord.attachments[0].history,undefined);assert.equal(JSON.stringify(saved).includes('objectPath'),false);assert.equal(JSON.stringify(saved).includes('storageId'),false);
  assert.equal(await(await s.call(route,'GET',undefined,null)).text(),'revision 8');assert.equal((await s.call(route+'?revision=0','GET',undefined,null)).status,404);assert.equal(await(await s.call(route+'?revision=0&ticket='+saved.fileTicket,'GET',undefined,null)).text(),'original');
  const stale=await upload('stale');assert.equal((await s.call('/records/'+saved.id,'PUT',{record:base,version:saved.version-1,uploadIds:[stale],replacements:[{fileId,uploadId:stale}]})).status,409);
  assert.equal((await s.call('/records/'+saved.id,'DELETE',{version:saved.version})).status,200);assert.equal([...s.objects.keys()].filter(path=>path.startsWith('records/')).length,0);
});
test('booklet number and primary attachment round-trip; stale or invalid selections are handled',async()=>{
  const s=setup();async function upload(name){const up=await(await s.call('/uploads','POST',{files:[{name,size:pdf.length,role:'attachment'}]})).json();s.objects.set(up.uploads[0].path,pdf);return up.uploads[0].id;}
  const first=await upload('report.pdf'),second=await upload('deck.pptx');
  let saved=await(await s.call('/records','POST',{record:{...base,number:'  A-12 ',primaryAttachmentId:second},uploadIds:[first,second]})).json();
  assert.equal(saved.number,'A-12');assert.equal(saved.primaryAttachmentId,second);
  const fetched=await(await s.call('/records/'+saved.id,'GET')).json();assert.equal(fetched.number,'A-12');assert.equal(fetched.primaryAttachmentId,second);
  for(const number of ['1234567890123','bad\u0001'])assert.equal((await s.call('/records/'+saved.id,'PUT',{version:saved.version,record:{...base,number}})).status,400);
  assert.equal((await s.call('/records/'+saved.id,'PUT',{version:saved.version,record:{...base,primaryAttachmentId:'../bad'}})).status,400);
  const updated=await(await s.call('/records/'+saved.id,'PUT',{version:saved.version,record:{...base,primaryAttachmentId:'missing'}})).json();
  assert.equal(updated.number,undefined);assert.equal(updated.primaryAttachmentId,null);
  const automatic=await(await s.call('/records','POST',{record:base})).json();assert.equal(automatic.number,undefined);assert.equal(automatic.primaryAttachmentId,null);
});
