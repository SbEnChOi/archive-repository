(() => {
  let prompt;addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;});
  addEventListener('appinstalled',()=>{prompt=null;document.querySelector('[data-install-status]').textContent='설치됨';});
  addEventListener('DOMContentLoaded',()=>{const button=document.querySelector('[data-install]'),status=document.querySelector('[data-install-status]');if(!button)return;
    button.onclick=async()=>{if(matchMedia('(display-mode:standalone)').matches){status.textContent='설치됨';return;}if(prompt){const pending=prompt;prompt=null;await pending.prompt();const result=await pending.userChoice;status.textContent=result.outcome==='accepted'?'설치됨':'';return;}status.textContent=/iPhone|iPad/.test(navigator.userAgent)?'공유 메뉴 → 홈 화면에 추가':'브라우저 메뉴 → Archive Repository 설치';};
    document.querySelector('[data-shortcut]').onclick=()=>{const url=/^https?:\/\//.test(location.origin)?location.origin:'https://archive-repository.vercel.app',blob=new Blob(['[InternetShortcut]\r\nURL='+url+'/\r\n'],{type:'application/internet-shortcut'}),link=document.createElement('a'),objectURL=URL.createObjectURL(blob);link.href=objectURL;link.download='Archive Repository.url';link.click();setTimeout(()=>URL.revokeObjectURL(objectURL),1000);};
    if('serviceWorker'in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
})();
