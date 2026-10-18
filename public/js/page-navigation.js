// Keep specialist builder, supply and admin controls while sharing public destinations.
(() => {
  const header = document.querySelector('.environment-topbar, .topbar, .masthead');
  if (!header) return;
  const actionPaths={'builder-guest-pass':'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-3c0-4 16-4 16 0v3','builder-login':'M14 3h6v18h-6M3 12h12M10 7l5 5-5 5','clear-scene':'M12 4v16M4 12h16','save-scene':'M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-7h8v7','publish-scene':'M12 16V3M6 9l6-6 6 6M4 16v5h16v-5','play-scene':'M7 3l14 9-14 9z','sound-toggle':'M4 9h4l5-5v16l-5-5H4zM17 8q5 4 0 8'};
  header.querySelectorAll('button').forEach(button=>{const path=actionPaths[button.id];if(!path)return;const label=button.textContent.trim();button.setAttribute('aria-label',label);button.title=label;const text=document.createElement('span');text.className='page-action-label';text.textContent=label;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('width','22');svg.setAttribute('height','22');const stroke=document.createElementNS('http://www.w3.org/2000/svg','path');stroke.setAttribute('d',path);stroke.setAttribute('stroke','currentColor');stroke.setAttribute('fill','none');stroke.setAttribute('stroke-width','2');svg.append(stroke);button.replaceChildren(svg,text);});
  const toggle = document.createElement('button');
  toggle.type='button'; toggle.className='page-navigation-toggle';
  toggle.setAttribute('aria-label','Open navigation'); toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-controls','page-navigation');
  toggle.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Menu</span>';
  const nav=document.createElement('nav'); nav.id='page-navigation'; nav.className='page-navigation'; nav.hidden=true; nav.setAttribute('aria-label','Site navigation');
  for (const [href,label] of [['model-explorer.html?environment=public-commons&autoplay=1','Play public world'],['arcade.html?environment=neon-junction&mode=solo','Neon Junction arcade park'],['environment-builder.html?layout=arcade-park&environment=neon-junction','Customize Neon Junction'],['model-explorer.html#custom-item-library','Custom item library'],['model-market.html','Game marketplace'],['builder-market.html','Builder marketplace'],['environment-builder.html','Environment builder'],['members.html#world-atlas','Member maps and deeds'],['buy-mzk.html','Buy MZK'],['members.html','Account and Backpack']]) {
    const link=document.createElement('a'); link.href=href; link.textContent=label; nav.append(link);
  }
  window.addEventListener('resize', () => filterMobileLinks(), {passive:true});
  function filterMobileLinks() {
    const mobile = window.matchMedia('(max-width: 720px)').matches;
    nav.querySelectorAll('a').forEach(link => {
      const label = (link.textContent || '').replace(/[^a-z]/gi,'').toLowerCase();
      const href = (link.getAttribute('href') || '').replace(/[^a-z]/gi,'').toLowerCase();
      if (['mainfeed','hologhost'].includes(label) || /mainfeed|hologhost/.test(href)) link.hidden = mobile;
    });
  }
  const setOpen=(open,restore=false)=>{filterMobileLinks();nav.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');if(restore)toggle.focus();};
  toggle.addEventListener('click',()=>setOpen(nav.hidden));
  nav.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);});
  document.addEventListener('click',event=>{if(!nav.contains(event.target)&&!toggle.contains(event.target))setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!nav.hidden)setOpen(false,true);});
  header.append(toggle); document.body.append(nav);
  const position=()=>nav.style.setProperty('--page-navigation-top',Math.max(0,header.getBoundingClientRect().bottom)+'px');
  if(window.ResizeObserver)new ResizeObserver(position).observe(header);
  window.addEventListener('resize',position,{passive:true});window.addEventListener('scroll',position,{passive:true});position();
})();
