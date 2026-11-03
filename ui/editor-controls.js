(() => {
  const colors=['#c83732','#df5036','#eb7642','#ed9c48','#e5b94e','#d5cb64','#a8bd59','#76a755','#39866a','#247d74','#248b98','#287b9d','#33669b','#3d5195','#5142ad','#7252ae','#9257a6','#b46199','#cc738a','#da9295','#dfb1a2','#c09d7a','#9a795c','#785e51','#535b49','#667570','#81949b','#a0a4ab','#62656e','#303238'];
  const safeUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
  function anchor(label,url){const link=document.createElement('a');link.textContent=label;link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;}
  function richText(target,value){
    target.replaceChildren();const text=String(value||''),pattern=/\[([^\]\n]{1,80})\]\((https?:\/\/[^\s]+?)\)/g;let end=0;
    for(const match of text.matchAll(pattern)){target.append(document.createTextNode(text.slice(end,match.index)));const url=safeUrl(match[2]);target.append(url?anchor(match[1],url):document.createTextNode(match[0]));end=match.index+match[0].length;}
    target.append(document.createTextNode(text.slice(end)));
  }
  function linkList(target,links=[],onOpen){target.replaceChildren(...links.flatMap(link=>{const url=safeUrl(link.url);if(!url)return[];const node=anchor(link.label||new URL(url).hostname,url);if(onOpen)node.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpen(link);});return[node];}));target.hidden=!target.childNodes.length;}
  globalThis.ArchiveLinks={richText,linkList};
  globalThis.createArchiveEditorControls=({root,form,isBusy})=>{
    const palette=root.querySelector('[data-color-presets]'),color=form.elements.color,rows=root.querySelector('[data-link-rows]'),add=root.querySelector('[data-link-add]');
    function syncColor(){[...palette.children].forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.color===color.value.toLowerCase())));root.querySelector('[data-color-custom]').style.setProperty('--ar-custom-color',color.value);}
    colors.forEach((value,index)=>{const button=document.createElement('button');button.type='button';button.className='ar-color-swatch';button.dataset.color=value;button.style.background=value;button.setAttribute('aria-label','표지 색상 '+(index+1)+' '+value);button.addEventListener('click',()=>{if(isBusy())return;color.value=value;syncColor();});palette.append(button);});
    color.addEventListener('input',syncColor);
    function updateRows(){add.disabled=rows.children.length>=10;[...rows.children].forEach((row,index)=>{row.querySelector('[data-link-label]').setAttribute('aria-label','링크 '+(index+1)+' 이름');row.querySelector('[data-link-url]').setAttribute('aria-label','링크 '+(index+1)+' 주소');});}
    function addRow(link={}){
      if(rows.children.length>=10||isBusy())return;const row=document.createElement('div');row.className='ar-link-row';
      row.innerHTML='<input data-link-label maxlength="80" placeholder="링크 이름" autocomplete="off"><input data-link-url type="url" maxlength="2000" placeholder="https://"><select data-link-mode aria-label="열기 방식"><option value="auto">기본 설정</option><option value="tab">새 탭</option><option value="inside">내부 보기</option></select><button type="button" data-link-insert>소개에 넣기</button><button type="button" data-link-remove aria-label="링크 삭제">×</button>';
      row.querySelector('[data-link-label]').value=link.label||'';row.querySelector('[data-link-url]').value=link.url||'';row.querySelector('[data-link-mode]').value=link.openMode||'auto';
      row.querySelector('[data-link-remove]').onclick=()=>{if(isBusy())return;const next=row.nextElementSibling||row.previousElementSibling;row.remove();updateRows();(next?.querySelector('input')||add).focus();};
      row.querySelector('[data-link-insert]').onclick=()=>{if(isBusy())return;const url=safeUrl(row.querySelector('[data-link-url]').value.trim());if(!url){row.querySelector('[data-link-url]').setCustomValidity('웹 주소를 입력해 주세요.');row.querySelector('[data-link-url]').reportValidity();return;}const label=(row.querySelector('[data-link-label]').value.trim()||new URL(url).hostname).replace(/[\[\]\n]/g,'');const field=form.elements.summary,insertion='['+label+']('+url.replace(/[()]/g,char=>char==='('?'%28':'%29')+')',start=field.selectionStart,end=field.selectionEnd;if(field.value.length-(end-start)+insertion.length>field.maxLength){root.querySelector('.ar-form-error').textContent='짧은 소개는 500자까지 입력할 수 있습니다.';return;}field.setRangeText(insertion,start,end,'end');field.focus();};
      row.querySelector('[data-link-url]').addEventListener('input',event=>event.target.setCustomValidity(''));
      rows.append(row);updateRows();return row;
    }
    add.onclick=()=>addRow()?.querySelector('input').focus();
    return{load(record){syncColor();rows.replaceChildren();(record.links?.length?record.links:[{}]).forEach(addRow);updateRows();},read(){return [...rows.children].flatMap(row=>{const label=row.querySelector('[data-link-label]').value.trim(),value=row.querySelector('[data-link-url]').value.trim(),openMode=row.querySelector('[data-link-mode]').value;if(!label&&!value)return[];const url=safeUrl(value);if(!url)throw new Error('링크의 웹 주소를 확인해 주세요.');return[{label:label||new URL(url).hostname,url,...(openMode==='auto'?{}:{openMode})}];});}};
  };
})();
