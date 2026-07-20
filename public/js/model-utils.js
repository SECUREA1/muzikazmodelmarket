export function escapeText(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
export function text(value,fallback=''){return String(value??fallback).trim();}
export function formatPublishDate(value){try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return 'Recently';}}
export function createEl(tag,attrs={},children=[]){const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')el.className=v;else if(k==='text')el.textContent=v;else if(k==='html')throw new Error('Unsafe html is disabled');else if(v!==undefined&&v!==null)el.setAttribute(k,v);} for(const child of [children].flat()){if(child!==undefined&&child!==null)el.append(child);} return el;}
export function normalizeLiveModelsUrl(){return `${window.location.origin}${window.location.pathname}#doll-kit-avatars`;}
export function normalizeLiveModelsHash(){if(location.hash==='#live-models'||(location.hash&&location.hash.includes('#doll-kit-avatars')&&location.hash!=='#doll-kit-avatars')) history.replaceState(null,'',normalizeLiveModelsUrl());}
export function publicShareUrl(model){return new URL(`model-explorer.html?model=${encodeURIComponent(model.id)}`,window.location.origin).href;}

export function modelsSignature(models=[]){return JSON.stringify(models.map(({id,modelUrl,thumbnailUrl,publishedAt,name})=>[id,modelUrl,thumbnailUrl,publishedAt,name]));}
