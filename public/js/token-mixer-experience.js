(() => {
  const root=document.querySelector('#token-mixer-app');
  if(!root)return;
  const focus=document.querySelector('#mixer-focus'),quests=document.querySelector('#need-quests');
  const notice=document.createElement('p');notice.className='mixer-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;root.prepend(notice);
  window.addEventListener('voice3:mixer-notice',event=>{notice.textContent=event.detail.message;notice.hidden=false;});
  function setFocus(on){document.body.classList.toggle('mixer-focused',on);focus.setAttribute('aria-pressed',String(on));focus.textContent=on?'Exit focus · Esc':'Focus mode';}
  focus.addEventListener('click',()=>setFocus(focus.getAttribute('aria-pressed')!=='true'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setFocus(false);});
  async function refresh(){try{const balance=await window.Voice3Audio.balance();document.querySelector('#mixer-quest-balance').textContent=`${balance} mixer credits available · 1 credit per sound added`;quests.classList.toggle('needs-credits',balance<1);}catch{document.querySelector('#mixer-quest-balance').textContent='Browser storage is unavailable. Allow site storage to use the audio library.';}}
  function showQuests(){if(location.hash!=='#need-quests')return;quests.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});quests.focus({preventScroll:true});refresh();}
  window.addEventListener('hashchange',showQuests);window.addEventListener('voice3:rewards-updated',refresh);window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);
  document.querySelector('#mixer-upload-shortcut').addEventListener('click',()=>document.querySelector('#file-input').click());
  const tracks=document.querySelector('#tracks'),ruler=document.querySelector('#time-ruler');tracks.addEventListener('scroll',()=>{ruler.scrollLeft=tracks.scrollLeft;},{passive:true});
  refresh();requestAnimationFrame(showQuests);
})();
