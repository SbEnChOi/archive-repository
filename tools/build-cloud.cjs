const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
if(fs.existsSync(path.join(root,'.env.cloud')))process.loadEnvFile(path.join(root,'.env.cloud'));
const url=process.env.ARCHIVE_SUPABASE_URL,key=process.env.ARCHIVE_SUPABASE_PUBLISHABLE_KEY;
if(!url||!key)throw new Error('ARCHIVE_SUPABASE_URL and ARCHIVE_SUPABASE_PUBLISHABLE_KEY are required');
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw new Error('Invalid cloud URL');
if(!key.startsWith('sb_publishable_')){try{const role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;if(role!=='anon')throw 0;}catch{throw new Error('Only a Supabase publishable/anon key may be bundled');}}
fs.mkdirSync(dist,{recursive:true});
fs.writeFileSync(path.join(dist,'.vercelignore'),'.env*\n.vercel/\n.gitignore\nnode_modules/\n');
const staticConfig={...JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')),buildCommand:'',installCommand:'',outputDirectory:'.'};
fs.writeFileSync(path.join(dist,'vercel.json'),JSON.stringify(staticConfig,null,2));
const shell=fs.readFileSync(path.join(root,'ui/shell.html'),'utf8'),css=['styles.css','tokens.css','reference.css','workspace.css','polish.css','startup.css'].map(file=>fs.readFileSync(path.join(root,'ui',file),'utf8')).join('\n');
const entrance=esbuild.buildSync({entryPoints:[path.join(root,'ui/motion.js')],bundle:true,minify:true,write:false,format:'iife',platform:'browser',target:['es2022'],legalComments:'none'}).outputFiles[0].text;
const jsSource=entrance+'\n'+['wheel.js','editor-controls.js','overview.js','story.js','folders.js','install.js','app.js'].map(file=>fs.readFileSync(path.join(root,'ui',file),'utf8')).join('\n');
const js='(()=>{const start=()=>{'+jsSource+'\n};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();})();';
const fragment=shell.replace('<!--SEEDS-->',()=> '[]').replace('<!--STYLES-->',()=>'<style>'+css+'</style>').replace('<!--SCRIPT-->',()=>'<script>'+js+'</script>');
fs.writeFileSync(path.join(dist,'index.html'),'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Archive Repository</title><link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#f3f7fb"><style>html,body{margin:0;overflow-x:clip;background:var(--ar-polish-paper)}button,a,select{cursor:pointer}</style><script defer src="/cloud-config.js"></script><script defer src="/repository-adapter.js"></script><script defer src="/document-editor.js"></script><script defer src="/file-viewer.js"></script></head><body>'+fragment.replace('<section data-startup="loading"', '<section data-repository="cloud" data-startup="loading"')+'</body></html>');
fs.writeFileSync(path.join(dist,'cloud-config.js'),'globalThis.ARCHIVE_CONFIG='+JSON.stringify({url,key}).replace(/</g,'\\u003c')+';');
for(const file of ['admin.html','demo.html','reader.html','reader.js'])fs.copyFileSync(path.join(root,'cloud',file),path.join(dist,file));
for(const file of ['pdf.mjs','pdf.worker.mjs'])fs.copyFileSync(path.join(root,'node_modules/pdfjs-dist/build',file),path.join(dist,file));
function copyTree(source,destination){fs.mkdirSync(destination,{recursive:true});for(const item of fs.readdirSync(source,{withFileTypes:true})){const from=path.join(source,item.name),to=path.join(destination,item.name);if(item.isDirectory())copyTree(from,to);else fs.copyFileSync(from,to);}}
for(const folder of ['cmaps','standard_fonts','wasm'])copyTree(path.join(root,'node_modules/pdfjs-dist',folder),path.join(dist,folder));
fs.copyFileSync(path.join(root,'node_modules/pdfjs-dist/LICENSE'),path.join(dist,'pdfjs-LICENSE.txt'));
esbuild.buildSync({entryPoints:[path.join(root,'cloud/adapter.js')],outfile:path.join(dist,'repository-adapter.js'),bundle:true,minify:true,platform:'browser',target:['es2022'],legalComments:'none'});
esbuild.buildSync({entryPoints:[path.join(root,'cloud/document-editor.js')],outfile:path.join(dist,'document-editor.js'),bundle:true,minify:true,platform:'browser',target:['es2022'],legalComments:'none'});
esbuild.buildSync({entryPoints:[path.join(root,'cloud/file-viewer.js')],outfile:path.join(dist,'file-viewer.js'),bundle:true,minify:true,platform:'browser',target:['es2022'],legalComments:'none'});
require('./build-icons.cjs')(dist);
console.log('Cloud build ready: dist/');




