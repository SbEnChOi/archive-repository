import {createClient} from '@supabase/supabase-js';
const config=globalThis.ARCHIVE_CONFIG;
const client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'archive-repository-auth'}});
const api=config.url+'/functions/v1/archive-api',params=new URLSearchParams(location.search),share=params.get('share'),publicView=location.pathname==='/public',versions=new Map();
async function request(path,method='GET',data){
  const {data:{session}}=await client.auth.getSession();
  const response=await fetch(api+path,{method,headers:{apikey:config.key,...(session?{Authorization:'Bearer '+session.access_token}:{}),...(method==='GET'?{}:{'Content-Type':'application/json','X-Archive-Request':'1'})},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'요청을 처리할 수 없습니다.');return result;
}
function remember(record){versions.set(record.id,record.version);record.links=record.links.map(link=>({...link,url:new URL(link.url,location.origin).href}));return record;}
function rememberFolder(folder){versions.set(folder.id,folder.version);return folder;}
async function save(id,record,files,photos,replacementId=null){
  const inputs=[...files.map(file=>({file,role:'attachment'})),...photos.map(file=>({file,role:'intro'}))];
  const {uploads}=inputs.length?await request('/uploads','POST',{files:inputs.map(({file,role})=>({name:file.name,size:file.size,role}))}):{uploads:[]};
  for(let index=0;index<uploads.length;index++){
    const {path,token}=uploads[index],{file}=inputs[index];
    const {error}=await client.storage.from('archive-files').uploadToSignedUrl(path,token,file,{contentType:file.type||'application/octet-stream'});
    if(error)throw new Error('파일 업로드에 실패했습니다. 다시 시도해 주세요.');
  }
  return remember(await request(id?'/records/'+encodeURIComponent(id):'/records',id?'PUT':'POST',{record,version:id?(record.version??versions.get(id)):0,uploadIds:uploads.map(upload=>upload.id),replacements:replacementId?[{fileId:replacementId,uploadId:uploads[0].id}]:[]}));
}
globalThis.ArchiveRepository={
  async load(){const result=await request('/records'+(publicView?'?view=public':''));result.records.forEach(remember);(result.folders||[]).forEach(rememberFolder);const match=location.pathname.match(/^\/r\/([a-zA-Z0-9_-]+)$/);if(match){const record=remember(await request('/records/'+match[1]+(share?'?share='+encodeURIComponent(share):'')));const index=result.records.findIndex(item=>item.id===record.id);if(index<0)result.records.push(record);else result.records[index]=record;result.selectedId=record.id;}document.querySelector('[data-account-label]')?.replaceChildren(document.createTextNode(result.owner?'로그아웃':'로그인'));return result;},
  async createFolder(title){return rememberFolder(await request('/folders','POST',{title}));},
  async renameFolder(id,title){return rememberFolder(await request('/folders/'+id,'PUT',{title,version:versions.get(id)}));},
  removeFolder(id){return request('/folders/'+id,'DELETE',{version:versions.get(id)});},
  create(record,files,photos=[]){return save(null,record,files,photos);},
  update(id,record,files,photos=[]){return save(id,record,files,photos);},
  replaceFile(record,file,input){return save(record.id,record,[input],[],file.id);},
  remove(id){return request('/records/'+encodeURIComponent(id),'DELETE',{version:versions.get(id)});},
  fileUrl(record,file){const url=new URL(api+'/files/'+encodeURIComponent(record.id)+'/'+encodeURIComponent(file.id));if(share)url.searchParams.set('share',share);if(record.fileTicket&&!publicView)url.searchParams.set('ticket',record.fileTicket);return url.href;},
  viewerUrl(record,file){return '/reader.html?src='+encodeURIComponent(this.fileUrl(record,file))+'&name='+encodeURIComponent(file.name);},
  projectUrl(record){const url=new URL(record.links[0].url,location.origin);if(url.pathname==='/demo/'+record.id&&url.origin===location.origin&&share)url.searchParams.set('share',share);return url.href;},
  getMode(){try{return localStorage.getItem('archive-open-mode')==='inside'?'inside':'tab';}catch{return'tab';}},
  setMode(value){try{localStorage.setItem('archive-open-mode',value);}catch{}}
};
globalThis.addEventListener('DOMContentLoaded',async()=>{
  if(location.pathname==='/auth/callback'){
    const {data,error}=await client.auth.getSession();if(!error&&data.session){location.replace('/');return;}
    history.replaceState(null,'','/admin');
  }
  const container=document.querySelector('.ar-settings-content');
  if(container){const row=document.createElement('div');row.className='ar-settings-line';row.innerHTML='<h2>관리</h2><a class="ar-secondary" href="/admin" data-account-label>로그인</a>';container.prepend(row);const {data:{session}}=await client.auth.getSession();if(session){const button=row.querySelector('a');button.textContent='로그아웃';button.onclick=async event=>{event.preventDefault();button.setAttribute('aria-disabled','true');await client.auth.signOut();location.replace('/');};}}
  const form=document.querySelector('[data-login-form]');if(!form)return;
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='';try{await request('/login','POST',{email:form.elements.email.value});status.textContent='메일에서 로그인 링크를 열어 주세요.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
});
