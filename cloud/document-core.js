import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
const namespaces=['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'];
const xmlSpace='http://www.w3.org/XML/1998/namespace';
function nearestParagraph(node,ns){for(let parent=node.parentNode;parent;parent=parent.parentNode)if(parent.namespaceURI===ns&&parent.localName==='p')return parent;}
function tokens(paragraph,ns){return Array.from(paragraph.getElementsByTagNameNS(ns,'*')).filter(node=>['t','br','tab'].includes(node.localName)&&nearestParagraph(node,ns)===paragraph).map(node=>({node,text:node.localName==='t'?node.textContent:node.localName==='tab'?'\t':'\n'}));}
function paragraphs(doc,ns){return Array.from(doc.getElementsByTagNameNS(ns,'p'));}
function blocked(p,ns){return ['fldChar','instrText','fldSimple','ins','del','sdt'].some(tag=>p.getElementsByTagNameNS(ns,tag).length)||Array.from(p.getElementsByTagNameNS(ns,'br')).some(node=>node.getAttributeNS(ns,'type')&&node.getAttributeNS(ns,'type')!=='textWrapping');}
function parseXML(xml,Parser){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('이 문서의 XML 형식은 편집할 수 없습니다.');const doc=new Parser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length||!namespaces.includes(doc.documentElement?.namespaceURI)||doc.documentElement.localName!=='document')throw Error('Word 문서 내용을 읽을 수 없습니다.');return doc;}
function replaceToken(node,value,doc,ns){const prefix=node.prefix||doc.documentElement.prefix||'w',parent=node.parentNode;for(const part of value.split(/([\n\t])/)){if(!part)continue;const element=doc.createElementNS(ns,prefix+':'+(part==='\n'?'br':part==='\t'?'tab':'t'));if(element.localName==='t'){element.setAttributeNS(xmlSpace,'xml:space','preserve');element.appendChild(doc.createTextNode(part));}parent.insertBefore(element,node);}parent.removeChild(node);}
function updateParagraph(paragraph,value,doc,ns){
  const list=tokens(paragraph,ns),old=list.map(token=>token.text).join('');if(old===value)return;
  if(blocked(paragraph,ns))throw Error('필드 또는 변경 추적이 포함된 문단은 편집할 수 없습니다.');
  let prefix=0,suffix=0;while(prefix<old.length&&prefix<value.length&&old[prefix]===value[prefix])prefix++;while(suffix<old.length-prefix&&suffix<value.length-prefix&&old[old.length-1-suffix]===value[value.length-1-suffix])suffix++;
  if(prefix&&/[\uD800-\uDBFF]/.test(old[prefix-1]))prefix--;if(suffix&&/[\uDC00-\uDFFF]/.test(old[old.length-suffix]))suffix--;
  const insertion=value.slice(prefix,value.length-suffix),end=old.length-suffix;let offset=0,inserted=false;
  for(const token of list){const start=offset,finish=start+token.text.length;offset=finish;let keep=token.text.slice(0,Math.max(0,Math.min(token.text.length,prefix-start)))+token.text.slice(Math.max(0,Math.min(token.text.length,end-start)));
    if(!inserted&&prefix<=finish){const left=token.text.slice(0,Math.max(0,prefix-start)),right=token.text.slice(Math.max(0,end-start));keep=left+insertion+right;inserted=true;}
    if(keep!==token.text)replaceToken(token.node,keep,doc,ns);
  }
  if(!inserted&&insertion){const prefixName=doc.documentElement.prefix||'w',existing=Array.from(paragraph.getElementsByTagNameNS(ns,'r')).find(run=>nearestParagraph(run,ns)===paragraph),run=existing||doc.createElementNS(ns,prefixName+':r'),text=doc.createElementNS(ns,prefixName+':t');run.appendChild(text);if(!existing)paragraph.appendChild(run);replaceToken(text,insertion,doc,ns);}
}
export function readDocx(input,environment={DOMParser:globalThis.DOMParser,XMLSerializer:globalThis.XMLSerializer}){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.byteLength>10*1024*1024)throw Error('Word 편집은 10 MB까지 지원합니다.');let size=0,count=0;
  const files=unzipSync(bytes,{filter:entry=>{size+=entry.originalSize;count++;if(size>64*1024*1024||count>2000||entry.name.split('/').includes('..'))throw Error('Word 문서 구조가 너무 큽니다.');return true;}});
  if(!files['word/document.xml']||!files['[Content_Types].xml'])throw Error('올바른 .docx 파일이 아닙니다.');
  const xml=strFromU8(files['word/document.xml']),doc=parseXML(xml,environment.DOMParser),ns=doc.documentElement.namespaceURI,list=paragraphs(doc,ns);
  const items=list.map((p,index)=>({index,text:tokens(p,ns).map(token=>token.text).join(''),heading:/heading|제목/i.test(p.getElementsByTagNameNS(ns,'pStyle')[0]?.getAttributeNS(ns,'val')||''),locked:Boolean(blocked(p,ns))}));
  return{paragraphs:items,save(values){if(!Array.isArray(values)||values.length!==items.length||values.some(value=>typeof value!=='string'||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))||values.reduce((n,value)=>n+value.length,0)>2*1024*1024)throw Error('문서 내용을 확인해 주세요.');if(values.every((value,index)=>value===items[index].text))return bytes.slice();const next=parseXML(xml,environment.DOMParser),nodes=paragraphs(next,ns);nodes.forEach((node,index)=>updateParagraph(node,values[index],next,ns));const outputFiles={...files,'word/document.xml':strToU8(new environment.XMLSerializer().serializeToString(next))};if(Object.values(outputFiles).reduce((n,value)=>n+value.length,0)>64*1024*1024)throw Error('수정본의 문서 구조가 너무 큽니다.');const output=zipSync(outputFiles,{level:6});if(output.length>10*1024*1024)throw Error('수정본이 Word 편집 한도인 10 MB를 넘습니다.');return output;}};
}
export function readText(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>2*1024*1024)throw Error('텍스트 편집은 2 MB까지 지원합니다.');const utf16=bytes[0]===255&&bytes[1]===254?'le':bytes[0]===254&&bytes[1]===255?'be':null,bom=bytes[0]===239&&bytes[1]===187&&bytes[2]===191;
  let text;try{text=new TextDecoder(utf16?'utf-16'+utf16:'utf-8',{fatal:true}).decode(bytes);}catch{throw Error('UTF-8 또는 UTF-16 텍스트 파일을 사용해 주세요.');}
  return{text,save(value){if(typeof value!=='string'||value.length>2*1024*1024)throw Error('텍스트 편집은 2 MB까지 지원합니다.');if(utf16){if(2+value.length*2>2*1024*1024)throw Error('텍스트 편집은 2 MB까지 지원합니다.');const result=new Uint8Array(2+value.length*2);result.set(utf16==='le'?[255,254]:[254,255]);for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);result[2+i*2+(utf16==='le'?0:1)]=code&255;result[2+i*2+(utf16==='le'?1:0)]=code>>8;}return result;}const encoded=new TextEncoder().encode(value);if(encoded.length+(bom?3:0)>2*1024*1024)throw Error('텍스트 편집은 2 MB까지 지원합니다.');if(!bom)return encoded;const result=new Uint8Array(encoded.length+3);result.set([239,187,191]);result.set(encoded,3);return result;}};
}
