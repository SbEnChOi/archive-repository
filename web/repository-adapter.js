(() => {
  const params=new URLSearchParams(location.search),share=params.get('share'),publicView=location.pathname==='/public';
  async function request(path,method='GET',data){const response=await fetch(path,{method,credentials:'same-origin',headers:method==='GET'?{}:{'Content-Type':'application/json','X-Archive-Request':'1'},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'요청을 처리할 수 없습니다.');return result;}
  async function encode(files,role='attachment'){return Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,role,data:String(reader.result).split(',')[1]});reader.onerror=()=>reject(new Error('파일을 읽을 수 없습니다.'));reader.readAsDataURL(file);})));
  }
  globalThis.ArchiveRepository={
    createFolder(title){return request('/api/folders','POST',{title});},
    renameFolder(id,title,version){return request('/api/folders/'+id,'PUT',{title,version});},
    removeFolder(id,version){return request('/api/folders/'+id,'DELETE',{version});},
    async load(){const result=await request('/api/records'+(publicView?'?view=public':''));const match=location.pathname.match(/^\/r\/([a-zA-Z0-9_-]+)$/);if(match){const record=await request('/api/records/'+match[1]+(share?'?share='+encodeURIComponent(share):''));if(!result.records.some(item=>item.id===record.id))result.records.push(record);result.selectedId=record.id;}return result;},
    async create(record,files,photos=[]){return request('/api/records','POST',{record,files:[...await encode(files),...await encode(photos,'intro')]});},
    async update(id,record,files,photos=[]){return request('/api/records/'+encodeURIComponent(id),'PUT',{record,version:record.version||0,files:[...await encode(files),...await encode(photos,'intro')]});},
    async replaceFile(record,file,input){return request('/api/records/'+encodeURIComponent(record.id),'PUT',{record,version:record.version||0,replaceFileId:file.id,files:await encode([input])});},
    remove(id){return request('/api/records/'+encodeURIComponent(id),'DELETE',{});},
    fileUrl(record,file){return '/files/'+encodeURIComponent(record.id)+'/'+encodeURIComponent(file.id)+(share?'?share='+encodeURIComponent(share):'');},
    viewerUrl(record,file){return '/reader.html?src='+encodeURIComponent(new URL(this.fileUrl(record,file),location.origin).href)+'&name='+encodeURIComponent(file.name);},
    projectUrl(record){let url=new URL(record.links[0].url);const aliases=['127.0.0.1','localhost'],demo=url.pathname==='/demo/'+record.id;if(demo&&url.protocol===location.protocol&&url.port===location.port&&aliases.includes(url.hostname)&&aliases.includes(location.hostname))url=new URL(url.pathname+url.search,location.origin);if(share&&demo&&url.origin===location.origin)url.searchParams.set('share',share);return url.href;},
    getMode(){try{return localStorage.getItem('archive-open-mode')==='inside'?'inside':'tab';}catch{return'tab';}},
    setMode(mode){try{localStorage.setItem('archive-open-mode',mode);}catch{}}
  };
})();
