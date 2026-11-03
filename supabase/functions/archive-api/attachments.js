const editable=/\.(docx|txt|md|csv|json)$/i;
function invalid(){const error=new Error('수정할 첨부파일을 확인해 주세요.');error.status=400;throw error;}
export function attachmentPaths(files){return files.flatMap(file=>[file,...(file.history||[])]).map(file=>file.objectPath||file.storageId||file.id);}
export function publicAttachment(file,owner){const {objectPath,storageId,history,...meta}=file;return{...meta,...(owner&&history?.length?{history:history.map(item=>{const {objectPath,storageId,id,history,...safe}=item;return safe;})}:{})};}
export function replaceAttachments(existing,fresh,replacements=[]){
  if(!Array.isArray(replacements)||replacements.length>12||new Set(replacements.map(item=>item?.fileId)).size!==replacements.length||new Set(replacements.map(item=>item?.uploadId)).size!==replacements.length)invalid();
  const used=new Set(),updated=existing.map(file=>{
    const replacement=replacements.find(item=>item?.fileId===file.id);if(!replacement)return file;const upload=fresh.find(item=>item.id===replacement.uploadId);
    if(!upload||file.role==='intro'||upload.role==='intro'||!editable.test(file.name)||file.name!==upload.name)invalid();used.add(upload.id);
    const {history,...current}=file,snapshot={...current,revision:file.revision||0,savedAt:file.savedAt||file.updatedAt||new Date().toISOString()},all=[...(history||[]),snapshot],kept=all.length<=5?all:[all[0],...all.slice(-4)];
    return{...upload,id:file.id,storageId:upload.storageId||upload.id,revision:(file.revision||0)+1,savedAt:new Date().toISOString(),history:kept};
  });
  if(replacements.some(item=>!existing.some(file=>file.id===item?.fileId)||!used.has(item?.uploadId)))invalid();
  return[...updated,...fresh.filter(file=>!used.has(file.id))];
}
