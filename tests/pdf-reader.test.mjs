import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
test('PDF.js renders all three original report pages with readable text',async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const source=await fs.readFile(path.join(root,'tests/fixtures/report.pdf')),document=await getDocument({data:new Uint8Array(source),standardFontDataUrl:path.join(root,'node_modules/pdfjs-dist/standard_fonts').replaceAll(path.sep,'/')+'/',isEvalSupported:false}).promise;
  try{assert.equal(document.numPages,3);for(let index=1;index<=3;index++){const page=await document.getPage(index),viewport=page.getViewport({scale:1}),{canvas,context}=document.canvasFactory.create(viewport.width,viewport.height);await page.render({canvasContext:context,viewport}).promise;assert.match((await page.getTextContent()).items.map(item=>item.str).join(' '),/Research Report/);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let p=0;p<rgba.length;p+=4)if(rgba[p]<180&&rgba[p+1]<180&&rgba[p+2]<180)ink++;assert.ok(ink>500);if(index===1){await fs.mkdir(path.join(root,'output/pdf'),{recursive:true});await fs.writeFile(path.join(root,'output/pdf/cloud-report.png'),canvas.toBuffer('image/png'));}document.canvasFactory.destroy({canvas,context});}}
  finally{await document.loadingTask.destroy();}
});
