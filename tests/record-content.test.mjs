import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredAttachment,attachmentKind,primaryLabel,markdownReference} from '../cloud/record-content.js';

const readme={id:'readme',name:'README (1).md',mime:'text/plain; charset=utf-8'},pdf={id:'pdf',name:'보고서.pdf',mime:'application/pdf'},photo={id:'intro',name:'cover.png',mime:'image/png',role:'intro'};
test('project with GitHub and an uploaded README opens the README instead of the external link',()=>{
 const record={kind:'PROJECT',links:[{url:'https://github.com/example/repository'}],attachments:[photo,pdf,readme]};
 assert.equal(preferredAttachment(record),readme);assert.equal(primaryLabel(record), 'README 읽기');
});
test('research defaults to PDF and intro images are never treated as project files',()=>{
 assert.equal(preferredAttachment({kind:'RESEARCH',attachments:[photo,readme,pdf]}),pdf);
 assert.equal(preferredAttachment({kind:'PROJECT',attachments:[photo]}),null);
});
test('classifies Markdown by extension even if uploaded with a generic content type',()=>{
 assert.equal(attachmentKind({name:'README.MD',mime:'application/octet-stream'}),'markdown');
 assert.equal(attachmentKind({name:'notes.txt',mime:'text/plain; charset=utf-8'}),'text');
 assert.equal(attachmentKind({name:'deck.pptx',mime:'application/octet-stream'}),'slides');
 assert.equal(attachmentKind({name:'sheet.XLSX',mime:'application/octet-stream'}),'sheet');
 assert.equal(attachmentKind({name:'report.docx',mime:'application/octet-stream'}),'word');
 assert.equal(attachmentKind({name:'legacy.doc',mime:'application/msword'}),'download');
 assert.equal(primaryLabel({kind:'PROJECT',links:[{url:'https://example.com'}],attachments:[photo]}),'프로젝트 열기');
});
test('manual primary attachment overrides the automatic preference',()=>{
 const record={kind:'RESEARCH',primaryAttachmentId:'deck',attachments:[photo,pdf,readme,{id:'deck',name:'deck.pptx',mime:'application/octet-stream'}]};
 assert.equal(preferredAttachment(record).id,'deck');assert.equal(primaryLabel(record),'문서 보기');
 const stale={kind:'RESEARCH',primaryAttachmentId:'missing',attachments:[photo,pdf,readme]};
 assert.equal(preferredAttachment(stale),pdf);
});
test('office documents are preferred before arbitrary files but after PDF and text',()=>{
 const word={id:'word',name:'report.docx',mime:'application/octet-stream'},sheet={id:'sheet',name:'data.xlsx',mime:'application/octet-stream'},slides={id:'slides',name:'talk.pptx',mime:'application/octet-stream'},other={id:'other',name:'archive.zip',mime:'application/zip'};
 assert.equal(preferredAttachment({kind:'PROJECT',attachments:[other,slides]}),slides);
 assert.equal(preferredAttachment({kind:'PROJECT',attachments:[other,word,sheet]}),word);
 assert.equal(preferredAttachment({kind:'RESEARCH',attachments:[other,slides]}),slides);
 assert.equal(primaryLabel({kind:'PROJECT',attachments:[sheet]}),'문서 보기');
 assert.equal(primaryLabel({kind:'RESEARCH',attachments:[word]}),'문서 보기');
});
test('uploaded README keeps repository-relative documents and images reachable',()=>{
 const record={links:[{url:'https://example.com'},{url:'https://github.com/SbEnChOi/bmo-ai-assistant.git'}]};
 assert.equal(markdownReference(record,'docs/PROJECT_REPORT.md'),'https://github.com/SbEnChOi/bmo-ai-assistant/blob/HEAD/docs/PROJECT_REPORT.md');
 assert.equal(markdownReference(record,'./assets/photo.jpg',true),'https://raw.githubusercontent.com/SbEnChOi/bmo-ai-assistant/HEAD/assets/photo.jpg');
 assert.equal(markdownReference(record,'https://example.com/reference'),'https://example.com/reference');
 assert.equal(markdownReference(record,'javascript:alert(1)'),null);
 assert.equal(markdownReference(record,'https://user:password@example.com'),null);
 assert.equal(markdownReference(record,'\u0001//user:password@example.com'),null);
 assert.equal(markdownReference({links:[]},'docs/report.md'),null);
 assert.equal(markdownReference(record,'#current-features'),null);
});
