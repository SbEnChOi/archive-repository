import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createHandler} from './handler.js';

const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),bucket=admin.storage.from('archive-files');
async function checked(result:any){if(result.error)throw result.error;return result.data;}
const objectUrl=(path:string)=>url+'/storage/v1/object/authenticated/archive-files/'+path.split('/').map(encodeURIComponent).join('/');
const repo={
  async config(){return checked(await admin.from('archive_config').select('*').eq('singleton',true).single());},
  async sendLogin(email:string,redirect:string){return checked(await admin.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:redirect}}));},
  async list(owner:boolean){let query=admin.from('archive_records').select('*').order('sort_order');if(!owner)query=query.eq('document->>visibility','public');return checked(await query);},
  async get(id:string){return checked(await admin.from('archive_records').select('*').eq('id',id).maybeSingle());},
  async folders(){return checked(await admin.from('archive_records').select('*').eq('document->>kind','FOLDER').order('sort_order'));},
  async addUpload(upload:any){return checked(await admin.from('archive_uploads').insert(upload));},
  async signUpload(path:string){const data=await checked(await bucket.createSignedUploadUrl(path));return{token:data.token};},
  async uploads(ids:string[]){return ids.length?checked(await admin.from('archive_uploads').select('*').in('id',ids)):[];},
  async copy(from:string,to:string){return checked(await bucket.copy(from,to));},
  async info(path:string){return checked(await bucket.info(path));},
  async prefix(path:string){const response=await fetch(objectUrl(path),{headers:{Authorization:'Bearer '+key,apikey:key,Range:'bytes=0-15'}});if(!response.ok)throw new Error('File unavailable');const reader=response.body!.getReader();try{const result=await reader.read();return result.value?.slice(0,16)||new Uint8Array();}finally{await reader.cancel();}},
  async commit(document:any,version:number,ids:string[]){const data=await checked(await admin.rpc('archive_commit',{p_document:document,p_version:version,p_upload_ids:ids}));return data[0];},
  async removeRecord(id:string,version:number){const rows=await checked(await admin.from('archive_records').delete().eq('id',id).eq('version',version).select('id'));if(!rows.length)throw {code:'40001'};},
  async removeObjects(paths:string[]){if(paths.length)return checked(await bucket.remove(paths));},
  download(path:string,range:string|null,method:string){return fetch(objectUrl(path),{method,headers:{Authorization:'Bearer '+key,apikey:key,...(range?{Range:range}:{})}});},
  async cleanup(){const expired=await checked(await admin.from('archive_uploads').select('id,object_path').lt('expires_at',new Date().toISOString()).limit(100));if(expired.length){await checked(await bucket.remove(expired.map((row:any)=>row.object_path)));await checked(await admin.from('archive_uploads').delete().in('id',expired.map((row:any)=>row.id)));}}
};
Deno.serve(createHandler({repo,signingSecret:'archive-file-ticket-v1:'+key,authenticate:async(authorization:string)=>{const token=authorization.replace(/^Bearer\s+/i,'');const {data,error}=await admin.auth.getUser(token);return error?null:data.user;}}));
