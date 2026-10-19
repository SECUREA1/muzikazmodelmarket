/** Your encounter preference follows you between game pages and browser tabs. */
export const RAD_TOX_PREFERENCE_KEY='muzikazRadToxEnabled';
export const RAD_TOX_PREFERENCE_EVENT='muzikaz:rad-tox-enabled-change';
let fallback=true;

export function readRadToxEnabled(){
 try{if(globalThis.localStorage)fallback=globalThis.localStorage.getItem(RAD_TOX_PREFERENCE_KEY)!=='false';}catch{}
 return fallback;
}

export function setRadToxEnabled(enabled){
 fallback=enabled!==false;
 try{globalThis.localStorage?.setItem(RAD_TOX_PREFERENCE_KEY,String(fallback));}catch{}
 globalThis.window?.dispatchEvent(new CustomEvent(RAD_TOX_PREFERENCE_EVENT,{detail:{enabled:fallback}}));
 return fallback;
}

export function watchRadToxEnabled(callback){
 const changed=event=>callback(event.detail?.enabled!==false);
 const stored=event=>{if(event.key===RAD_TOX_PREFERENCE_KEY||event.key===null)callback(readRadToxEnabled());};
 globalThis.window?.addEventListener(RAD_TOX_PREFERENCE_EVENT,changed);
 globalThis.window?.addEventListener('storage',stored);
 return ()=>{globalThis.window?.removeEventListener(RAD_TOX_PREFERENCE_EVENT,changed);globalThis.window?.removeEventListener('storage',stored);};
}
