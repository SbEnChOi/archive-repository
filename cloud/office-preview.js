import {unzipSync,strFromU8} from 'fflate';
import mammoth from 'mammoth/mammoth.browser.js';

const MAX_OFFICE=10*1024*1024,MAX_UNZIP=64*1024*1024,MAX_ENTRIES=2000,MAX_SHEETS=20,MAX_ROWS=300,MAX_COLS=40,MAX_SLIDES=200;
const DRAWING_NS='http://schemas.openxmlformats.org/drawingml/2006/main';
const asBytes=input=>input instanceof Uint8Array?input:new Uint8Array(input);
function unzip(input){
 const bytes=asBytes(input);if(bytes.byteLength>MAX_OFFICE)throw Error('문서는 10 MB까지 미리 볼 수 있습니다.');let size=0,count=0;
 return unzipSync(bytes,{filter:entry=>{size+=entry.originalSize;count++;if(size>MAX_UNZIP||count>MAX_ENTRIES||entry.name.split('/').includes('..'))throw Error('문서 구조가 너무 큽니다.');return true;}});
}
function validateArchive(bytes){
 let size=0,count=0;
 unzipSync(bytes,{filter:entry=>{size+=entry.originalSize;count++;if(size>MAX_UNZIP||count>MAX_ENTRIES||entry.name.split('/').includes('..'))throw Error('문서 구조가 너무 큽니다.');return false;}});
}
function parseXml(text,Parser,label){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error(label+'의 XML 형식은 미리 볼 수 없습니다.');
 const doc=new Parser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error(label+'을 읽을 수 없습니다.');
 return doc;
}
const elements=(node,name)=>Array.from(node.getElementsByTagName(name));
const attribute=(node,name)=>node.getAttribute(name)||Array.from(node.attributes||[]).find(item=>item.localName===name||item.name===name)?.value||'';
const sheetNumber=name=>Number(name.match(/(\d+)\.xml$/)?.[1]||0);
function resolvePath(target){
 const value=String(target||''),segments=(value.startsWith('/')?value.slice(1):'xl/'+value).split('/'),stack=[];
 for(const segment of segments){
  if(!segment||segment==='.')continue;
  if(segment==='..'){if(!stack.length)throw Error('문서 구조가 너무 큽니다.');stack.pop();continue;}
  stack.push(segment);
 }
 return stack.join('/');
}
function sharedStrings(files,Parser){
 if(!files['xl/sharedStrings.xml'])return[];
 return elements(parseXml(strFromU8(files['xl/sharedStrings.xml']),Parser,'Excel'),'si').map(item=>elements(item,'t').map(text=>text.textContent).join(''));
}
function cellValue(cell,strings){
 const type=attribute(cell,'t'),value=elements(cell,'v')[0]?.textContent||'';
 if(type==='s')return strings[Number(value)]??'';
 if(type==='inlineStr')return elements(cell,'t').map(text=>text.textContent).join('');
 if(type==='b')return value==='1'?'TRUE':'FALSE';
 return value;
}
function columnIndex(reference){
 const letters=reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'';let index=0;
 for(const letter of letters)index=index*26+letter.charCodeAt(0)-64;
 return Math.max(0,index-1);
}
function sheetRows(xml,strings,Parser){
 const rows=[];let truncated=false;
 for(const row of elements(parseXml(xml,Parser,'Excel'),'row')){
  if(rows.length>=MAX_ROWS){truncated=true;break;}
  const cells=[];
  for(const cell of elements(row,'c')){
   const reference=attribute(cell,'r'),index=reference?columnIndex(reference):cells.length;
   if(index>=MAX_COLS){truncated=true;continue;}
   cells[index]=cellValue(cell,strings);
  }
  if(cells.some(cell=>cell!==undefined&&cell!==''))rows.push(Array.from(cells,cell=>cell??''));
 }
 return{rows,truncated};
}
export function sheetPreviews(input,Parser=globalThis.DOMParser){
 const files=unzip(input),strings=sharedStrings(files,Parser),listed=[];
 if(files['xl/workbook.xml']){
  const relationships={};
  if(files['xl/_rels/workbook.xml.rels'])for(const rel of elements(parseXml(strFromU8(files['xl/_rels/workbook.xml.rels']),Parser,'Excel'),'Relationship'))relationships[attribute(rel,'Id')]=resolvePath(attribute(rel,'Target'));
  for(const sheet of elements(parseXml(strFromU8(files['xl/workbook.xml']),Parser,'Excel'),'sheet'))listed.push({name:attribute(sheet,'name')||'Sheet '+(listed.length+1),path:relationships[attribute(sheet,'id')]});
 }
 const available=Object.keys(files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a,b)=>sheetNumber(a)-sheetNumber(b));
 const mapped=listed.map((sheet,index)=>({name:sheet.name,path:sheet.path&&files[sheet.path]?sheet.path:available[index]}));
 const chosen=(mapped.some(sheet=>sheet.path&&files[sheet.path])?mapped.filter(sheet=>sheet.path&&files[sheet.path]):available.map((path,index)=>({name:'Sheet '+(index+1),path}))).slice(0,MAX_SHEETS);
 return chosen.map(sheet=>({name:sheet.name,...sheetRows(strFromU8(files[sheet.path]),strings,Parser)}));
}
function nearestParagraph(node){
 for(let parent=node.parentNode;parent;parent=parent.parentNode)if(parent.namespaceURI===DRAWING_NS&&parent.localName==='p')return parent;
}
export function slidePreviews(input,Parser=globalThis.DOMParser){
 const files=unzip(input),names=Object.keys(files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>sheetNumber(a)-sheetNumber(b));
 if(!names.length)throw Error('PowerPoint 슬라이드를 읽을 수 없습니다.');
 return names.slice(0,MAX_SLIDES).map(name=>{
  const doc=parseXml(strFromU8(files[name]),Parser,'PowerPoint'),paragraphs=[];
  for(const paragraph of Array.from(doc.getElementsByTagNameNS(DRAWING_NS,'p'))){
   const text=Array.from(paragraph.getElementsByTagNameNS(DRAWING_NS,'t')).filter(run=>nearestParagraph(run)===paragraph).map(run=>run.textContent).join('');
   if(text.trim())paragraphs.push(text);
  }
  return{number:sheetNumber(name),paragraphs};
 });
}
export async function docxToHtml(input){
 const bytes=asBytes(input);if(bytes.byteLength>MAX_OFFICE)throw Error('Word 문서는 10 MB까지 미리 볼 수 있습니다.');
 validateArchive(bytes);
 const {value}=await mammoth.convertToHtml({arrayBuffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 return value;
}
