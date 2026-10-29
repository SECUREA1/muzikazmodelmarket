// Product links carry a public catalog identity only. They never contain a
// Backpack record, upload location, account credential or an action to buy/use.
const SOURCES=new Set(['upgrade','builder','player','model','native-map','land','bundle','care']);
const CATALOG_PREFIX=/^(?:upgrade|builder|player|model|native-map|land|care):|^bundle[-:]/;
const catalogs=new WeakMap();
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=400&&!/^(?:https?|blob|data|javascript|file):/i.test(value)&&/^[\p{L}\p{N}][\p{L}\p{N}._:@+-]*$/u.test(value)?value:null;
const unavailable=record=>!record||/^(?:private|unlisted|draft|hidden)$/i.test(String(record.visibility||''))||record.private===true||record.isPublic===false||record.listed===false||[record.status,record.listing_status,record.listingStatus].some(value=>/^(?:private|unlisted|draft|hidden|inactive|deleted|cancelled|canceled|sold)$/i.test(String(value||'')));

export function productReference(record){
 if(typeof record==='string')return identifier(record);
 if(unavailable(record))return null;
 const id=identifier(record.id),sku=identifier(record.sku||record.economySku);
 // Exact listing identities take precedence over the underlying asset's SKU.
 if(id&&/^(?:player|builder):/.test(id))return id;
 const seller=identifier(record.sellerId||record.seller_id),item=identifier(record.itemId||record.item_id);
 if(seller&&item)return 'player:'+seller+':'+item;
 const listing=identifier(record.listing_id||record.listingId);
 if(listing)return 'builder:'+listing;
 if((record.source==='upgrade'||!record.source)&&sku)return 'upgrade:'+sku;
 if(id&&(SOURCES.has(record.source)||CATALOG_PREFIX.test(id)))return id;
 if(sku)return 'upgrade:'+sku;
 // A bare native identity resolves only if the public catalog has one unique
 // canonical offer. Multiple historic SKU aliases are deliberately ambiguous.
 return identifier(record.buildAssetId||record.materialId&&'material:'+record.materialId);
}

export function productShareUrl(record,base=globalThis.location?.href){
 const reference=productReference(record);if(!reference)return null;
 try{
  const url=new URL('product.html',base||'https://muzikazmodelmarket.onrender.com/');
  if(!/^https?:$/.test(url.protocol))return null;
  url.username='';url.password='';url.search='';url.hash='';url.searchParams.set('id',reference);return url.href;
 }catch{return null;}
}

export async function shareProduct(record,{navigator:browser=globalThis.navigator,clipboard=browser?.clipboard,base}={}){
 const url=productShareUrl(record,base);if(!url)return {url:null,method:'unavailable'};
 if(typeof browser?.share==='function'){
  try{await browser.share({title:record?.name||record?.itemName||record?.asset?.name||'MUZIKAZ product',url});return {url,method:'share'};}
  catch(error){if(error?.name==='AbortError')return {url,method:'share',canceled:true};}
 }
 if(typeof clipboard?.writeText==='function'){
  try{await clipboard.writeText(url);return {url,method:'clipboard'};}catch{}
 }
 return {url,method:'link'};
}

function defaultRequest(path,options){
 const api=globalThis.window?.MUZIKAZ_API||globalThis.MUZIKAZ_API;
 if(api?.fetch)return api.fetch(path,options);
 if(typeof globalThis.fetch==='function')return globalThis.fetch(path,options);
 throw new Error('The public market is unavailable.');
}
function publicCatalog(request){
 if(catalogs.has(request))return catalogs.get(request);
 const pending=(async()=>{
  const response=await request('/api/market/catalog',{cache:'no-store'});
  const payload=typeof response?.json==='function'?await response.json():response;
  if(response?.ok===false||payload?.success===false)throw new Error(payload?.message||'The public market could not be loaded.');
  const rows=Array.isArray(payload)?payload:payload?.data;
  if(!Array.isArray(rows))throw new Error('The public market returned an invalid catalog.');
  return rows.filter(record=>!unavailable(record));
 })();
 catalogs.set(request,pending);
 pending.catch(()=>{if(catalogs.get(request)===pending)catalogs.delete(request);});
 return pending;
}
function aborted(){const error=new Error('Product loading was canceled.');error.name='AbortError';return error;}
function withSignal(promise,signal){
 if(!signal)return promise;
 if(signal.aborted)return Promise.reject(aborted());
 return new Promise((resolve,reject)=>{
  const cancel=()=>{signal.removeEventListener('abort',cancel);reject(aborted());};
  signal.addEventListener('abort',cancel,{once:true});
  promise.then(value=>{signal.removeEventListener('abort',cancel);if(!signal.aborted)resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});
 });
}

export async function loadPublicProductCatalog({request=defaultRequest,signal}={}){
 if(signal?.aborted)throw aborted();
 return withSignal(publicCatalog(request),signal);
}

export async function resolveSharedProduct(reference,{request=defaultRequest,signal}={}){
 const id=productReference(reference);if(!id)return null;
 if(signal?.aborted)throw aborted();
 // A canceled page stops consuming the result without aborting another page
 // component's shared request. Successful results are cached for this page.
 const rows=await loadPublicProductCatalog({request,signal});
 const exact=rows.filter(record=>record.id===id);
 if(exact.length)return exact.length===1?exact[0]:null;
 if(id.startsWith('upgrade:')){
  const offers=rows.filter(record=>record.source==='upgrade'&&record.sku===id.slice(8));
  return offers.length===1?offers[0]:null;
 }
 if(CATALOG_PREFIX.test(id))return null;
 const native=rows.filter(record=>(record.source==='upgrade'||record.sku)&&record.buildAssetId===id);
 return native.length===1?native[0]:null;
}
