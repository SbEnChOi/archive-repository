import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {docxToHtml,sheetPreviews,slidePreviews} from '../cloud/office-preview.js';

const zip=files=>zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,strToU8(value)])));
const docx=zip({
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/document.xml':'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello archive</w:t></w:r></w:p><w:p><w:r><w:t>두 번째 문단</w:t></w:r></w:p></w:body></w:document>'
});
const xlsx=zip({
 'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="데이터" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/sharedStrings.xml':'<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>이름</t></si><si><r><t>값</t></r><r><t> 정리</t></r></si></sst>',
 'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>메모</t></is></c></row><row r="2"><c r="A2"><v>42</v></c><c r="B2" t="b"><v>1</v></c></row></sheetData></worksheet>'
});
const pptx=zip({
 'ppt/slides/slide1.xml':'<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hello</a:t></a:r><a:r><a:t> world</a:t></a:r></a:p><a:p><a:r><a:t>Second line</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
 'ppt/slides/slide2.xml':'<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>둘째 슬라이드</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
});

test('docx is converted to sanitized-ready HTML',async()=>{
 const html=await docxToHtml(docx);
 assert.match(html,/Hello archive/);assert.match(html,/두 번째 문단/);assert.match(html,/<p>/);
});
test('xlsx sheets keep names, shared strings and typed cells',()=>{
 const [sheet]=sheetPreviews(xlsx,DOMParser);
 assert.equal(sheet.name,'데이터');assert.deepEqual(sheet.rows,[['이름','값 정리','메모'],['42','TRUE']]);assert.equal(sheet.truncated,false);
});
test('xlsx falls back to Sheet n when workbook metadata is missing',()=>{
 const [sheet]=sheetPreviews(zip({'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>'}),DOMParser);
 assert.equal(sheet.name,'Sheet 1');assert.deepEqual(sheet.rows,[['7']]);
});
test('pptx slides group runs by paragraph in slide order',()=>{
 assert.deepEqual(slidePreviews(pptx,DOMParser),[{number:1,paragraphs:['Hello world','Second line']},{number:2,paragraphs:['둘째 슬라이드']}]);
});
test('office XML with DOCTYPE or ENTITY is rejected',()=>{
 const hostile=zip({'xl/worksheets/sheet1.xml':'<?xml version="1.0"?><!DOCTYPE worksheet [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>&xxe;</v></c></row></sheetData></worksheet>'});
 assert.throws(()=>sheetPreviews(hostile,DOMParser),/XML 형식/);
});
test('oversized office files are rejected before parsing',async()=>{
 const oversized=new Uint8Array(10*1024*1024+1);
 assert.throws(()=>sheetPreviews(oversized,DOMParser),/10 MB/);await assert.rejects(docxToHtml(oversized),/10 MB/);
});
function workbook(sheets,files){
 const entries={
  'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((sheet,index)=>'<sheet name="'+sheet.name+'" sheetId="'+(index+1)+'" r:id="rId'+(index+1)+'"/>').join('')+'</sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((sheet,index)=>'<Relationship Id="rId'+(index+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="'+sheet.target+'"/>').join('')+'</Relationships>',
  ...files
 };
 return zip(entries);
}
const worksheet=value=>'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>'+value+'</v></c></row></sheetData></worksheet>';
test('xlsx resolves relative workbook targets against xl/ without losing sheet identity',()=>{
 const result=sheetPreviews(workbook([{name:'첫째',target:'worksheets/sheet1.xml'},{name:'둘째',target:'../xl/worksheets/sheet2.xml'}],{'xl/worksheets/sheet1.xml':worksheet('1'),'xl/worksheets/sheet2.xml':worksheet('2')}),DOMParser);
 assert.deepEqual(result.map(sheet=>[sheet.name,sheet.rows]),[['첫째',[['1']]],['둘째',[['2']]]]);
});
test('xlsx keeps every listed sheet in order when a target is missing',()=>{
 const result=sheetPreviews(workbook([{name:'첫째',target:'worksheets/sheet1.xml'},{name:'둘째',target:'worksheets/missing.xml'}],{'xl/worksheets/sheet1.xml':worksheet('1'),'xl/worksheets/sheet2.xml':worksheet('2')}),DOMParser);
 assert.deepEqual(result.map(sheet=>[sheet.name,sheet.rows]),[['첫째',[['1']]],['둘째',[['2']]]]);
});
test('xlsx accepts package-absolute workbook targets',()=>{
 const [sheet]=sheetPreviews(workbook([{name:'절대',target:'/xl/worksheets/sheet1.xml'}],{'xl/worksheets/sheet1.xml':worksheet('9')}),DOMParser);
 assert.equal(sheet.name,'절대');assert.deepEqual(sheet.rows,[['9']]);
});
test('docx expansion is rejected before conversion',async()=>{
 const bomb=zipSync({'word/document.xml':new Uint8Array(65*1024*1024)});
 await assert.rejects(docxToHtml(bomb),/너무 큽니다/);
});
test('xlsx rejects workbook targets that escape the package root',()=>{
 const hostile=workbook([{name:'위험',target:'../../../etc/passwd'}],{'xl/worksheets/sheet1.xml':worksheet('1')});
 assert.throws(()=>sheetPreviews(hostile,DOMParser),/너무 큽니다/);
});
