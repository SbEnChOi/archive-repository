import {replaceAttachments,attachmentPaths,publicAttachment} from './attachments.js';
const MAX_BYTES=50*1024*1024,ID=/^[a-zA-Z0-9_-]{1,80}$/,UUID=/^[0-9a-f-]{36}$/;
const MIME={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain; charset=utf-8',md:'text/plain; charset=utf-8',csv:'text/plain; charset=utf-8',json:'text/plain; charset=utf-8',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav'};
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
function fail(status,message){throw new HttpError(status,message);}
const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function hash(value){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
function secret(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
export function fileMetadata(input){
  if(!input||typeof input.name!=='string'||!input.name||input.name.length>240||/[\x00-\x1f/\\]/.test(input.name)||!Number.isSafeInteger(input.size)||input.size<1||input.size>MAX_BYTES||!['attachment','intro'].includes(input.role))fail(400,'첨부파일을 확인해 주세요.');
  const extension=input.name.split('.').pop().toLowerCase(),mime=MIME[extension]||'application/octet-stream';
  if(input.role==='intro'&&!['image/png','image/jpeg','image/webp'].includes(mime))fail(400,'소개 사진은 JPG, PNG, WebP 이미지로 올려 주세요.');
  return{id:crypto.randomUUID(),name:input.name,size:input.size,mime,...(input.role==='intro'?{role:'intro'}:{})};
}
export function checkSignature(meta,bytes){
  const text=new TextDecoder().decode(bytes),png=[137,80,78,71,13,10,26,10];
  if(meta.mime==='application/pdf'&&!text.startsWith('%PDF-'))fail(400,'올바른 PDF 파일이 아닙니다.');
  if(meta.role==='intro'){
    const valid=meta.mime==='image/png'?png.every((n,i)=>bytes[i]===n):meta.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:meta.mime==='image/webp'&&text.startsWith('RIFF')&&text.slice(8,12)==='WEBP';
    if(!valid)fail(400,'소개 사진의 파일 형식을 확인해 주세요.');
  }
}
export function validateRecord(input,previous){
  if(!input||typeof input!=='object')fail(400,'기록을 확인해 주세요.');
  const text=(key,max)=>{const value=input[key]??'';if(typeof value!=='string'||value.length>max)fail(400,'입력 길이를 확인해 주세요.');return value.trim();};
  const title=text('title',120);if(!title||!['PROJECT','RESEARCH'].includes(input.kind)||!['public','private','unlisted'].includes(input.visibility)||!/^#[0-9a-f]{6}$/i.test(input.color))fail(400,'기록 설정을 확인해 주세요.');
  const numberValue=input.number??'';if(typeof numberValue!=='string'||numberValue.length>12||/[\x00-\x1f\x7f]/.test(numberValue))fail(400,'책자 번호를 확인해 주세요.');
  const number=numberValue.trim();
  const primaryAttachmentId=input.primaryAttachmentId??null;if(primaryAttachmentId!==null&&(typeof primaryAttachmentId!=='string'||!ID.test(primaryAttachmentId)))fail(400,'첨부파일 선택을 확인해 주세요.');
  if(!Array.isArray(input.links)||input.links.length>10)fail(400,'링크를 확인해 주세요.');
  const links=input.links.map(link=>{let url;try{if(!link||typeof link.url!=='string'||link.url.length>2000)throw 0;url=new URL(link.url);}catch{fail(400,'웹 주소를 확인해 주세요.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail(400,'웹 주소를 확인해 주세요.');if(link.openMode!==undefined&&!['inside','tab'].includes(link.openMode))fail(400,'링크 열기 방식을 확인해 주세요.');return{label:String(link.label||'프로젝트').slice(0,80),url:url.href,...(link.openMode?{openMode:link.openMode}:{})};});
  const removed=input.removePhotoIds??[];if(!Array.isArray(removed)||removed.length>8||removed.some(id=>!previous?.attachments.some(file=>file.id===id&&file.role==='intro')))fail(400,'삭제할 소개 사진을 확인해 주세요.');
  const folderId=input.folderId===undefined?previous?.folderId||null:input.folderId;if(folderId!==null&&(typeof folderId!=='string'||!ID.test(folderId)))fail(400,'폴더를 확인해 주세요.');
  return{id:previous?.id||crypto.randomUUID(),title,kind:input.kind,color:input.color,visibility:input.visibility,...(number?{number}:{}),primaryAttachmentId,summary:text('summary',500),body:text('body',12000),links,folderId,tags:Array.isArray(input.tags)?input.tags.filter(tag=>typeof tag==='string').slice(0,20).map(tag=>tag.slice(0,40)):[],attachments:(previous?.attachments||[]).filter(file=>!removed.includes(file.id)),createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}

export function createHandler({repo,authenticate,signingSecret,now=()=>Date.now()}){
  const key=crypto.subtle.importKey('raw',encoder.encode(signingSecret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  async function ticket(row){const data=b64(encoder.encode(JSON.stringify({id:row.id,version:row.version,exp:now()+12*3600000})));return data+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key,encoder.encode(data))));}
  async function validTicket(value,row){try{if(!value||value.length>600)return false;const [data,signature]=value.split('.');const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));if(!await crypto.subtle.verify('HMAC',await key,decode(signature),encoder.encode(data)))return false;const claims=JSON.parse(new TextDecoder().decode(decode(data)));return claims.id===row.id&&claims.version===row.version&&claims.exp>now();}catch{return false;}}
  async function canRead(row,owner,url){return owner||row.document.visibility==='public'||row.document.visibility==='unlisted'&&row.document.shareHash&&await hash(url.searchParams.get('share')||'')===row.document.shareHash;}
  async function serialize(row,owner,config){const {shareToken,shareHash,...record}=row.document;return{...record,version:row.version,attachments:record.attachments.map(file=>publicAttachment(file,owner)),...(owner?{fileTicket:await ticket(row),...(record.visibility==='unlisted'?{shareUrl:config.site_url+'/r/'+row.id+'?share='+encodeURIComponent(shareToken)}:record.visibility==='public'?{shareUrl:config.site_url+'/r/'+row.id}:{})}:{})};}
  return async function handle(req){
    let headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
    try{
      const config=await repo.config(),origin=req.headers.get('origin'),allowed=origin&&config.origins.includes(origin);
      if(allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-archive-request, range','Access-Control-Allow-Methods':'GET, HEAD, POST, PUT, DELETE, OPTIONS','Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length, Content-Disposition'});
      if(req.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
      const url=new URL(req.url),pathname=url.pathname.replace(/^\/(?:functions\/v1\/)?archive-api(?=\/|$)/,'');
      const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
      if(pathname==='/health')return json({app:'archive-repository',cloud:true});
      if(pathname==='/login'&&req.method==='POST'){
        if(!allowed||req.headers.get('x-archive-request')!=='1'||!req.headers.get('content-type')?.startsWith('application/json'))fail(403,'요청 출처를 확인해 주세요.');
        const raw=await req.text();if(raw.length>300)fail(400,'이메일을 확인해 주세요.');let input;try{input=JSON.parse(raw);}catch{fail(400,'이메일을 확인해 주세요.');}
        if(typeof input.email!=='string'||input.email.trim().toLowerCase()!==config.owner_email.toLowerCase())fail(403,'관리 계정의 이메일을 입력해 주세요.');
        await repo.sendLogin(config.owner_email,config.site_url+'/auth/callback');return json({sent:true});
      }
      let owner=false;const authorization=req.headers.get('authorization');
      if(authorization){const user=await authenticate(authorization);owner=Boolean(user?.email_confirmed_at&&user.email?.toLowerCase()===config.owner_email.toLowerCase());}
      if(!['GET','HEAD'].includes(req.method)){
        if(!owner)fail(401,'관리자 로그인이 필요합니다.');
        if(!allowed||req.headers.get('x-archive-request')!=='1'||!req.headers.get('content-type')?.startsWith('application/json'))fail(403,'요청 출처를 확인해 주세요.');
      }
      async function body(){if(Number(req.headers.get('content-length'))>65536)fail(413,'입력 용량을 확인해 주세요.');const text=await req.text();if(encoder.encode(text).length>65536)fail(413,'입력 용량을 확인해 주세요.');try{return JSON.parse(text);}catch{fail(400,'요청 형식을 확인해 주세요.');}}
      const folderMatch=pathname.match(/^\/folders\/([a-zA-Z0-9_-]{1,80})$/);
      if((pathname==='/folders'&&req.method==='POST')||(folderMatch&&['PUT','DELETE'].includes(req.method))){
        const input=await body(),old=folderMatch?await repo.get(folderMatch[1]):null;if(folderMatch&&old?.document.kind!=='FOLDER')fail(404,'폴더를 찾을 수 없습니다.');if(old&&input.version!==old.version)fail(409,'다른 곳에서 수정된 폴더입니다. 새로고침 후 다시 시도해 주세요.');
        if(req.method==='DELETE'){await repo.removeRecord(old.id,old.version);return json({deleted:true});}
        if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>80||/[\x00-\x1f]/.test(input.title))fail(400,'폴더 이름을 확인해 주세요.');if(!old&&(await repo.folders()).length>=100)fail(400,'폴더는 100개까지 만들 수 있습니다.');
        const folder={id:old?.id||crypto.randomUUID(),kind:'FOLDER',title:input.title.trim(),visibility:'private',color:'#63b6eb',summary:'',body:'',links:[],tags:[],attachments:[],createdAt:old?.document.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()},saved=await repo.commit(folder,old?.version||0,[]);return json({id:saved.id,title:saved.document.title,version:saved.version},old?200:201);
      }
      if(pathname==='/records'&&req.method==='GET'){
        const full=owner&&url.searchParams.get('view')!=='public',rows=(await repo.list(full)).filter(row=>row.document.kind!=='FOLDER'),folderRows=await repo.folders(),visible=rows.filter(row=>full||row.document.visibility==='public'),known=new Set(folderRows.map(row=>row.id));
        return json({owner:full,records:await Promise.all(visible.map(async row=>({...await serialize(row,full,config),folderId:known.has(row.document.folderId)?row.document.folderId:null}))),folders:folderRows.filter(row=>full||visible.some(book=>book.document.folderId===row.id)).map(row=>({id:row.id,title:row.document.title,...(full?{version:row.version}:{})}))});
      }
      if(pathname==='/uploads'&&req.method==='POST'){
        const input=await body();if(!Array.isArray(input.files)||input.files.length>12)fail(400,'첨부파일을 확인해 주세요.');
        const files=input.files.map(fileMetadata);if(files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)fail(413,'한 번에 50 MB까지 첨부할 수 있습니다.');
        if(files.filter(file=>file.role==='intro').length>8)fail(400,'소개 사진은 8장까지 넣을 수 있습니다.');
        await repo.cleanup();const uploads=[];
        for(const metadata of files){const object_path='staging/'+metadata.id;await repo.addUpload({id:metadata.id,object_path,metadata});uploads.push({id:metadata.id,path:object_path,...await repo.signUpload(object_path)});}
        return json({uploads});
      }
      const recordMatch=pathname.match(/^\/records\/([a-zA-Z0-9_-]{1,80})$/),id=recordMatch?.[1];
      if(recordMatch&&req.method==='GET'){const row=await repo.get(id);if(!row||row.document.kind==='FOLDER'||!await canRead(row,owner,url))fail(404,'기록을 찾을 수 없습니다.');const result=await serialize(row,owner,config);if(result.folderId&&(await repo.get(result.folderId))?.document.kind!=='FOLDER')result.folderId=null;return json(result);}
      if((pathname==='/records'&&req.method==='POST')||(recordMatch&&req.method==='PUT')){
        const input=await body(),previous=id?await repo.get(id):null;if(id&&(!previous||previous.document.kind==='FOLDER'))fail(404,'기록을 찾을 수 없습니다.');
        if(previous&&input.version!==previous.version)fail(409,'다른 곳에서 수정된 기록입니다. 새로고침 후 다시 시도해 주세요.');
        const record=validateRecord(input.record,previous?.document),uploadIds=input.uploadIds??[];
        if(record.folderId&&(await repo.get(record.folderId))?.document.kind!=='FOLDER')fail(400,'폴더를 찾을 수 없습니다.');
        if(!Array.isArray(uploadIds)||uploadIds.length>12||new Set(uploadIds).size!==uploadIds.length||uploadIds.some(value=>typeof value!=='string'||!UUID.test(value)))fail(400,'첨부파일을 확인해 주세요.');
        const uploads=await repo.uploads(uploadIds);if(uploads.length!==uploadIds.length||uploads.some(item=>Date.parse(item.expires_at)<=now()))fail(400,'첨부파일 업로드가 만료되었습니다. 다시 선택해 주세요.');
        if(uploads.reduce((n,item)=>n+item.metadata.size,0)>MAX_BYTES)fail(413,'한 번에 50 MB까지 첨부할 수 있습니다.');
        if(record.attachments.filter(file=>file.role==='intro').length+uploads.filter(item=>item.metadata.role==='intro').length>8)fail(400,'소개 사진은 8장까지 넣을 수 있습니다.');
        if(record.visibility==='unlisted'){record.shareToken=previous?.document.visibility==='unlisted'?previous.document.shareToken:secret();record.shareHash=await hash(record.shareToken);}
        const copied=[];let saved;
        try{
          const fresh=[];for(const upload of uploads){const objectPath='records/'+record.id+'/'+upload.id;await repo.copy(upload.object_path,objectPath);copied.push(objectPath);const info=await repo.info(objectPath);if(info.size!==upload.metadata.size)fail(400,'첨부파일 크기가 일치하지 않습니다.');checkSignature(upload.metadata,await repo.prefix(objectPath));fresh.push({...upload.metadata,objectPath});}record.attachments=replaceAttachments(record.attachments,fresh,input.replacements);if(record.primaryAttachmentId&&!record.attachments.some(file=>file.id===record.primaryAttachmentId&&file.role!=='intro'))record.primaryAttachmentId=null;
          saved=await repo.commit(record,previous?.version||0,uploadIds);
        }catch(error){await repo.removeObjects(copied).catch(()=>{});throw error;}
        const currentPaths=new Set(attachmentPaths(record.attachments)),removed=attachmentPaths(previous?.document.attachments||[]).filter(path=>!currentPaths.has(path));
        await repo.removeObjects([...uploads.map(item=>item.object_path),...removed]).catch(()=>{});
        return json(await serialize(saved,true,config),previous?200:201);
      }
      if(recordMatch&&req.method==='DELETE'){const input=await body(),row=await repo.get(id);if(!row||row.document.kind==='FOLDER')fail(404,'기록을 찾을 수 없습니다.');if(input.version!==row.version)fail(409,'다른 곳에서 수정된 기록입니다. 새로고침 후 다시 시도해 주세요.');await repo.removeRecord(id,row.version);await repo.removeObjects(attachmentPaths(row.document.attachments)).catch(()=>{});return json({deleted:true});}
      const fileMatch=pathname.match(/^\/files\/([a-zA-Z0-9_-]{1,80})\/([a-f0-9-]{36})$/);
      if(fileMatch&&['GET','HEAD'].includes(req.method)){
        const row=await repo.get(fileMatch[1]);let file=row?.document.attachments.find(item=>item.id===fileMatch[2]);const ownerTicket=row&&await validTicket(url.searchParams.get('ticket'),row);if(!file||!await canRead(row,owner,url)&&!ownerTicket)fail(404,'파일을 찾을 수 없습니다.');if(url.searchParams.has('revision')){if(!owner&&!ownerTicket)fail(404,'파일을 찾을 수 없습니다.');file=file.history?.find(item=>String(item.revision)===url.searchParams.get('revision'));if(!file)fail(404,'파일을 찾을 수 없습니다.');}
        const range=req.headers.get('range');if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))fail(416,'파일 범위를 확인해 주세요.');
        const upstream=await repo.download(file.objectPath,range,req.method);if(![200,206,416].includes(upstream.status))fail(404,'파일을 찾을 수 없습니다.');
        const inline=url.searchParams.get('download')!=='1'&&(file.mime==='application/pdf'||/^(image|video|audio)\//.test(file.mime)||file.mime.startsWith('text/plain'));
        Object.assign(headers,{'Content-Type':file.mime,'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(file.name),'Accept-Ranges':'bytes'});
        for(const name of ['content-length','content-range'])if(upstream.headers.has(name))headers[name]=upstream.headers.get(name);
        return new Response(req.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
      }
      fail(404,'요청을 찾을 수 없습니다.');
    }catch(error){return new Response(JSON.stringify({error:error.status?error.message:error.code==='40001'?'다른 곳에서 수정된 기록입니다. 새로고침 후 다시 시도해 주세요.':'요청을 처리할 수 없습니다.'}),{status:error.status||(error.code==='40001'?409:500),headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});}
  };
}
