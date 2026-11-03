export const attachments=record=>(record.attachments||[]).filter(file=>file&&typeof file==='object'&&file.role!=='intro');
export function attachmentKind(file){
 if(/\.pdf$/i.test(file.name)||file.mime==='application/pdf')return'pdf';
 if(/\.(md|markdown)$/i.test(file.name))return'markdown';
 if(/\.(txt|csv|json)$/i.test(file.name)||file.mime?.startsWith('text/plain'))return'text';
 if(/\.docx$/i.test(file.name)||file.mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')return'word';
 if(/\.xlsx$/i.test(file.name)||file.mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return'sheet';
 if(/\.pptx$/i.test(file.name)||file.mime==='application/vnd.openxmlformats-officedocument.presentationml.presentation')return'slides';
 if(/^(image|video|audio)\//.test(file.mime))return'media';
 return'download';
}
export function preferredAttachment(record){
 const files=attachments(record),pdf=files.find(file=>attachmentKind(file)==='pdf'),readme=files.find(file=>/^readme(?:[ ._(-].*)?\.(md|markdown|txt)$/i.test(file.name));
 const chosen=files.find(file=>file.id&&file.id===record.primaryAttachmentId);
 return chosen||(record.kind==='RESEARCH'?pdf:readme)||pdf||files.find(file=>['markdown','text','word','sheet','slides'].includes(attachmentKind(file)))||files[0]||null;
}
export function primaryLabel(record){
 const file=preferredAttachment(record);if(!file)return record.kind==='RESEARCH'?'보고서 읽기':'프로젝트 열기';
 if(/^readme/i.test(file.name))return'README 읽기';const type=attachmentKind(file);
 return type==='pdf'?(record.kind==='RESEARCH'?'보고서 읽기':'PDF 읽기'):['word','sheet','slides'].includes(type)?'문서 보기':['text','markdown'].includes(type)?'문서 읽기':type==='media'?'파일 보기':'파일 다운로드';
}
export function markdownReference(record,value,image=false){
 if(typeof value!=='string'||!value.trim()||/[\u0000-\u001f\u007f]/.test(value)||value.trim().startsWith('#'))return null;
 try{const url=new URL(value);return['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{}
 if(/^[a-z][a-z0-9+.-]*:|^[\\/]/i.test(value.trim()))return null;
 for(const link of record.links||[]){
  try{const url=new URL(link.url);if(url.hostname!=='github.com'||!['https:','http:'].includes(url.protocol)||url.username||url.password)continue;const parts=url.pathname.match(/^\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)(?:\/|$)/i);if(!parts)continue;const owner=parts[1],repo=parts[2].replace(/\.git$/i,'');if(!repo)continue;const resolved=new URL(value,image?`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/`:`https://github.com/${owner}/${repo}/blob/HEAD/`);return['https:','http:'].includes(resolved.protocol)&&!resolved.username&&!resolved.password?resolved.href:null;}catch{}
 }
 return null;
}
