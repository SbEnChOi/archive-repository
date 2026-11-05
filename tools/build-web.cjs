const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const preview=process.env.ARCHIVE_PREVIEW_PATH||path.join(root,'output','preview.html');
const cssPath=path.join(root,'ui/styles.css');
if(!fs.existsSync(cssPath)){const previous=fs.readFileSync(preview,'utf8');fs.writeFileSync(cssPath,previous.match(/<style>([\s\S]*?)<\/style>/)[1].trim()+'\n');}
const shell=fs.readFileSync(path.join(root,'ui/shell.html'),'utf8');
const css=['styles.css','tokens.css','reference.css','workspace.css','polish.css','startup.css'].map(file=>fs.readFileSync(path.join(root,'ui',file),'utf8')).join('\n');
const entrance=require('esbuild').buildSync({entryPoints:[path.join(root,'ui/motion.js')],bundle:true,minify:true,write:false,format:'iife',platform:'browser',target:['es2022'],legalComments:'none'}).outputFiles[0].text;
const jsSource=entrance+'\n'+['wheel.js','editor-controls.js','overview.js','story.js','folders.js','install.js','app.js'].map(file=>fs.readFileSync(path.join(root,'ui',file),'utf8')).join('\n');
const js='(()=>{const start=()=>{'+jsSource+'\n};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();})();';
const seedData=JSON.parse(fs.readFileSync(path.join(root,'ui/seeds.json'),'utf8'));const sampleFiles=['atlas-start.png','atlas-motion.png'];if(sampleFiles.every(file=>fs.existsSync(path.join(root,'ui/examples',file))))seedData.find(record=>record.id==='seed-04').samplePhotos=sampleFiles.map((file,index)=>({src:'data:image/png;base64,'+fs.readFileSync(path.join(root,'ui/examples',file)).toString('base64'),alt:index?'Project Atlas 실행 화면':'Project Atlas 시작 화면'}));
const seeds=JSON.stringify(seedData).replace(/</g,'\\u003c');
const fragment=shell.replace('<!--SEEDS-->',()=>seeds).replace('<!--STYLES-->',()=>'<style>\n'+css+'\n</style>').replace('<!--SCRIPT-->',()=>'<script>\n'+js+'\n</script>');
fs.mkdirSync(path.dirname(preview),{recursive:true});
fs.writeFileSync(preview,fragment);
fs.mkdirSync(path.join(root,'web'),{recursive:true});
for(const file of ['reader.html','reader.js'])fs.copyFileSync(path.join(root,'cloud',file),path.join(root,'web',file));
fs.writeFileSync(path.join(root,'web/cloud-config.js'),'globalThis.ARCHIVE_CONFIG={url:location.origin};');
require('esbuild').buildSync({entryPoints:[path.join(root,'cloud/document-editor.js')],outfile:path.join(root,'web/document-editor.js'),bundle:true,minify:true,platform:'browser',target:['es2022'],legalComments:'none'});
require('esbuild').buildSync({entryPoints:[path.join(root,'cloud/file-viewer.js')],outfile:path.join(root,'web/file-viewer.js'),bundle:true,minify:true,platform:'browser',target:['es2022'],legalComments:'none'});
fs.writeFileSync(path.join(root,'web/index.html'),'<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Archive Repository</title><link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#f3f7fb"><style>html,body{margin:0;overflow-x:clip;background:var(--ar-polish-paper)}button,a,select{cursor:pointer}</style><script defer src="/repository-adapter.js"></script><script defer src="/document-editor.js"></script><script defer src="/file-viewer.js"></script></head><body>\n'+fragment.replace('<section data-startup="loading"', '<section data-repository="local" data-startup="loading"')+'\n</body></html>');
require('./build-icons.cjs')(path.join(root,'web'));
console.log('Archive Repository built');




