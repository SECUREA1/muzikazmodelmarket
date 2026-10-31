import {productReference,productShareUrl,shareProduct,resolveSharedProduct} from './product-share.js';
import {factoryOrderItemId,mountStoreAddressUI} from './store-address-ui.js';

const SOURCE_LABELS={upgrade:'Game item',builder:'Builder listing',player:'Member listing',model:'3D model','native-map':'World template',land:'Land',bundle:'Bundle',care:'Care supply'};
const words=value=>String(value||'').replace(/[-_]/g,' ');
const recordAsset=record=>record.asset||record.model||record;
export function productArtwork(record){
 const item=recordAsset(record),value=item.thumbnailUrl||item.thumbnail_url||item.thumbnail||item.previewUrl||item.imageUrl||item.image_url||item.image||record.preview||'';
 if(typeof value!=='string'||/[\\\u0000-\u001f]/.test(value))return '';
 if(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value))return value;
 try{const url=new URL(value,globalThis.location?.href||'https://muzikazmodelmarket.onrender.com/');return value&&/^https?:$/.test(url.protocol)?url.href:'';}catch{return '';}
}
export function productPrice(record){
 if(record.source==='native-map')return 'Public template · free';
 if(record.earnedOnly)return 'Earn in game';
 if(record.basic)return 'Included in the basic kit';
 if(record.source==='model'&&Number.isFinite(Number(record.priceUsd)))return '$'+Number(record.priceUsd).toFixed(2)+' USD';
 const amount=Number(record.priceMzk??record.price_mzk??record.price);
 return Number.isFinite(amount)&&amount>=0?amount.toLocaleString()+' MZK':'See current price in the market';
}
export function productFacts(record){
 const item=recordAsset(record),dimensions=record.dimensions||item.dimensions;
 return [
  ['Category',record.category||item.builder_category||item.category],
  ['Collection',SOURCE_LABELS[record.source]],
  ['Use',words(record.nativeFunction||record.behavior||item.function_data?.behavior)],
  ['Seller',record.seller||record.sellerName],
  ['Dimensions',Array.isArray(dimensions)&&dimensions.length===3&&dimensions.every(value=>Number.isFinite(Number(value))&&Number(value)>0)?dimensions.map(value=>Number(value).toLocaleString()).join(' × ')+' m':null],
  ['Map items',record.source==='native-map'&&Number.isFinite(Number(record.itemCount))?String(record.itemCount):null]
 ].filter(([,value])=>value!==undefined&&value!==null&&value!=='');
}

export async function initializeProductPage({document:doc=globalThis.document,location:pageLocation=globalThis.location,request,loadPreview=()=>import('./product-preview.js?v=forge-atelier-20261031'),share=shareProduct}={}){
 const page=doc?.querySelector('[data-product-page]');if(!page)return null;
 const status=page.querySelector('[data-product-status]'),title=page.querySelector('[data-product-title]'),content=page.querySelector('[data-product-content]');
 const reference=new URL(pageLocation.href).searchParams.get('id'),controller=new AbortController();
 globalThis.addEventListener?.('pagehide',()=>controller.abort(),{once:true});
 const unavailable=message=>{page.setAttribute('aria-busy','false');title.textContent='Product unavailable';status.textContent=message;content.hidden=true;doc.title='Product unavailable · MUZIKAZ WORLD';};
 if(!reference){unavailable('This link does not identify a product. Browse the market to find an item.');return null;}
 try{
  const record=await resolveSharedProduct(reference,{request,signal:controller.signal});
  if(!record){unavailable('This item is not in the public catalog. It may be private, unlisted, or no longer available.');return null;}
  const item=recordAsset(record),name=record.name||item.name||'MUZIKAZ product',description=record.description||item.description||'See this item in the MUZIKAZ market.';
  title.textContent=name;doc.title=name+' · MUZIKAZ WORLD';
  page.querySelector('[data-product-description]').textContent=description;
  page.querySelector('[data-product-price]').textContent=productPrice(record);
  page.querySelector('[data-product-source]').textContent=SOURCE_LABELS[record.source]||'MUZIKAZ collection';
  for(const [selector,value]of [['meta[name="description"]',description],['meta[property="og:title"]',name+' · MUZIKAZ WORLD'],['meta[property="og:description"]',description]])doc.querySelector(selector)?.setAttribute('content',value);
  const url=productShareUrl(record,pageLocation.href);if(url){doc.querySelector('link[rel="canonical"]')?.setAttribute('href',url);doc.querySelector('meta[property="og:url"]')?.setAttribute('content',url);}
  const artwork=productArtwork(record),image=page.querySelector('[data-product-image]'),placeholder=page.querySelector('[data-product-placeholder]');
  if(artwork){image.src=artwork;image.alt=name;image.hidden=false;placeholder.hidden=true;image.addEventListener('error',()=>{image.hidden=true;placeholder.hidden=false;},{once:true});}
  const facts=page.querySelector('[data-product-facts]');facts.replaceChildren();
  for(const [label,value]of productFacts(record)){const row=doc.createElement('div'),term=doc.createElement('dt'),detail=doc.createElement('dd');term.textContent=label;detail.textContent=value;row.append(term,detail);facts.append(row);}
  const entries=record.entries||[],bundle=page.querySelector('[data-product-bundle]');
  if(entries.length){bundle.hidden=false;const list=bundle.querySelector('ul');for(const entry of entries){const line=doc.createElement('li');line.textContent=(Number(entry.quantity)||1)+' × '+(entry.name||'Included item');list.append(line);}}
  const market=page.querySelector('[data-product-market]');market.href=record.source==='builder'||record.source==='native-map'?'builder-market.html':record.source==='care'?'ioncore-rpg-market.html':'model-market.html';
  for(const button of page.querySelectorAll('[data-product-preview]'))button.addEventListener('click',async()=>{
   button.disabled=true;status.textContent=button.dataset.productPreview==='ar'?'Opening AR preview…':'Opening 3D preview…';
   try{const {openProductPreview}=await loadPreview();await openProductPreview(record,{mode:button.dataset.productPreview});status.textContent='Product details ready.';}
   catch(error){status.textContent=error?.message||'The preview could not be opened. You can still browse this product in the market.';}
   finally{button.disabled=false;}
  });
  page.querySelector('[data-product-share]').addEventListener('click',async()=>{
   const result=await share(record,{base:pageLocation.href});
   if(result.canceled){status.textContent='Sharing canceled.';return;}
   if(result.method==='clipboard'){status.textContent='Product link copied.';return;}
   if(result.method==='share'){status.textContent='Product link shared.';return;}
   if(result.url){const fallback=page.querySelector('[data-product-copy-link]'),input=fallback.querySelector('input');fallback.hidden=false;input.value=result.url;input.focus();input.select();status.textContent='Select and copy this product link.';}
   else status.textContent='A public link is not available for this item.';
  });
  const supplyItemId=factoryOrderItemId(record);let deliveryAddressUI=null;
  if(supplyItemId){const receiving=doc.createElement('section');receiving.dataset.productSupply='';page.querySelector('[data-product-market]').before(receiving);deliveryAddressUI=mountStoreAddressUI(receiving,{request,itemId:supplyItemId,mode:'product'});globalThis.addEventListener?.('pagehide',()=>deliveryAddressUI.close(),{once:true});}
  content.hidden=false;page.setAttribute('aria-busy','false');status.textContent='Product details ready.';
  return {record,reference:productReference(record),deliveryAddressUI,dispose:()=>{controller.abort();deliveryAddressUI?.dispose();}};
 }catch(error){if(error?.name!=='AbortError')unavailable(error?.message||'The public market could not be loaded. Please try again later.');return null;}
}

if(typeof document!=='undefined'&&document.querySelector('[data-product-page]'))initializeProductPage();
