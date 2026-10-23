/** The social walkthrough keeps the exact destination while leaving the native
 * sports/solo renderer free to own its match and movement controls. */
export function residentWorldUrl(id,baseUrl=globalThis.location?.href||'http://localhost/'){
 if(typeof id!=='string'||!id.trim())return '';
 let base;try{base=new URL(baseUrl);}catch{return '';}
 if(!['http:','https:'].includes(base.protocol))return '';
 const target=new URL('model-explorer.html',base);
 target.search=new URLSearchParams({environment:id,house:id,walkthrough:'1',mode:'multiplayer',autoplay:'1'}).toString();
 return target.href;
}

export function mountResidentWorldLink(parent,idOrGetter,{compact=false,baseUrl}={}){
 const link=(parent.ownerDocument||document).createElement('a');link.className='resident-world-link';link.textContent=compact?'People & favors':'Meet residents & find local favors';link.setAttribute('aria-label','People & favors · walk this map with residents');link.title='Walk this map, meet its residents and help with local favors';
 link.style.cssText='display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;max-width:100%;padding:8px 12px;border:1px solid #83a86d;border-radius:8px;background:#142a20;color:#e4f2c7;text-decoration:none;text-align:center;font:600 12px/1.2 system-ui;pointer-events:auto;white-space:normal;flex:0 1 auto';
 if(compact){link.style.fontSize='10px';link.style.maxWidth='80px';link.style.padding='6px 8px';}
 function refresh(){
  let id;try{id=typeof idOrGetter==='function'?idOrGetter():idOrGetter;}catch{id=null;}
  const href=residentWorldUrl(id,baseUrl);if(href){link.href=href;link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');link.dataset.residentWorld=id;}
  else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.tabIndex=-1;delete link.dataset.residentWorld;}
  return Boolean(href);
 }
 for(const type of ['pointerdown','focus','contextmenu'])link.addEventListener(type,event=>{refresh();if(type==='pointerdown')event.stopPropagation();});
 link.addEventListener('click',event=>{if(!refresh())event.preventDefault();event.stopPropagation();});
 link.addEventListener('keydown',event=>event.stopPropagation());
 refresh();parent.append(link);return link;
}
