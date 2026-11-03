// Export local originals for the existing Supabase dashboard uploader and MCP SQL import.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/cloud-import');fs.mkdirSync(output,{recursive:true});
const source=JSON.parse(fs.readFileSync(path.join(root,'data/records.json'),'utf8')),master=fs.readFileSync(path.join(root,'data/owner.key')),manifest=[];
const records=source.records.map(input=>{
  const {share,...record}=input;
  if(share&&record.visibility==='unlisted'){const decipher=crypto.createDecipheriv('aes-256-gcm',master,Buffer.from(share.iv,'hex'));decipher.setAuthTag(Buffer.from(share.tag,'hex'));record.shareToken=Buffer.concat([decipher.update(Buffer.from(share.cipher,'hex')),decipher.final()]).toString('utf8');record.shareHash=crypto.createHash('sha256').update(record.shareToken).digest('base64url');}
  record.links=record.links.map(link=>{const url=new URL(link.url);return['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/demo/'+record.id?{...link,url:url.pathname}:link;});
  record.attachments=record.attachments.map(file=>{const localPath=path.join(root,'data/uploads',file.id),bytes=fs.readFileSync(localPath);if(bytes.length!==file.size)throw Error('Local file size mismatch');manifest.push({id:file.id,localPath,size:file.size,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});return{...file,objectPath:file.id};});
  return record;
});
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({manifest,records}),{mode:0o600});
const literal=JSON.stringify(records).replace(/'/g,"''");fs.writeFileSync(path.join(output,'records.sql'),"insert into public.archive_records(id,document) select value->>'id',value from jsonb_array_elements('"+literal+"'::jsonb) on conflict (id) do nothing; select count(*) as records from public.archive_records;");
console.log(JSON.stringify({records:records.length,files:manifest.length}));
