import {ENTERABLE_BUILDINGS} from './building-districts.js';
import {INTERACTIVE_DEVICES} from './interactive-devices.js';
import {UTILITY_TOOLS} from './game-utilities.js';
import {FISHING_GEAR} from './fishing-config.js';
export const MARKET_CATEGORIES=Object.freeze([
 ['weapons','Weapons & combat'],['tools','Tools & utilities'],['shipping','Shipping & port supplies'],['flight','Flight & mobility'],
 ['funhouse','Clown funhouse & carnival'],['fitness','Fitness & gym upgrades'],['factory','Factory & engineering'],['arcade','Arcade & card machines'],['sports','Sports & equipment'],['media','Media & live screens'],['buildings','Buildings & businesses'],['outdoors','Nature & outdoors'],['materials','Building materials'],['furniture','Furniture & interiors'],
 ['avatars','Characters & avatars'],['vehicles','Vehicles'],['pets','Pets & creatures'],
 ['wearables','Clothing & wearables'],['lands','Land & worlds'],['props','Props & models'],['care','Care supplies'],['other','Other items']
].map(([id,label])=>({id,label})));
export function marketCategory(item={},section='upgrades'){
 if(item.shippingSupplyId||item.kind==='stock'||item.type==='shipping-stock')return 'shipping';
 const reference=item.function_data?.device||item.asset?.function_data?.device||item.buildAssetId||item.asset?.buildAssetId,skuReference=String(item.sku||item.economySku||item.itemId||item.id||''),nativeId=reference||[...Object.keys(INTERACTIVE_DEVICES),...Object.keys(ENTERABLE_BUILDINGS)].find(id=>skuReference.endsWith(id));
 if(String(nativeId||'').startsWith('funhouse-')||/^(?:economy:)?native:funhouse-/.test(skuReference)||item.worldId==='muzikaz-clown-funhouse'||String(item.category||item.collection||'').toLowerCase().includes('funhouse'))return 'funhouse';
 if(String(nativeId||'').startsWith('fitness-')||String(item.category||item.collection||'').toLowerCase().includes('fitness'))return 'fitness';
 if(/^(?:factory|testing)-/.test(String(nativeId||''))||String(item.category||item.collection||'').toLowerCase().includes('factory'))return 'factory';
 const device=INTERACTIVE_DEVICES[nativeId];if(device&&['arcade','poker','slots','trivia'].includes(device.kind))return 'arcade';
 if(device&&['video','audio','image','board'].includes(device.kind))return 'media';
 if(ENTERABLE_BUILDINGS[nativeId])return 'buildings';
 const category=String(item.category||item.asset?.builder_category||'').toLowerCase();
 const nativeCategory=item.native?String(item.builderCategory||'').toLowerCase():'';
 if(String(nativeId||'').startsWith('hockey-')||category==='sports')return 'sports';
 if(nativeCategory==='arcade')return 'arcade';
 if(nativeCategory==='weapons')return 'weapons';
 if(nativeCategory==='characters')return 'avatars';
 if(nativeCategory==='creatures')return 'pets';
 if(nativeCategory==='buildings')return 'buildings';
 if(['landscape','plants'].includes(nativeCategory))return 'outdoors';
 if(nativeCategory==='terrain'&&item.kind!=='material')return 'lands';
 if(Array.isArray(item.entries)&&category.includes('luxury'))return 'furniture';
 if(category.includes('media & live'))return 'media';if(category.includes('buildings & businesses'))return 'buildings';if(category.includes('nature & outdoors'))return 'outdoors';
 if(category.includes('arcade')||category.includes('card machines'))return 'arcade';
 const type=String(item.assetType||item.itemType||item.type||item.asset?.asset_type||'').toLowerCase();
 const sku=String(item.sku||item.economySku||item.itemId||item.id||'').replace(/^economy:/,'');
 const tool=item.toolId||(sku.startsWith('tool:')?sku.slice(5):'');
 if(FISHING_GEAR.some(gear=>gear.id===tool||gear.id===nativeId))return 'tools';
 if(tool==='jetpack')return 'flight';
 if(item.kind==='material'||item.materialId||sku.startsWith('material:')||category.includes('building materials'))return 'materials';
 if(/vehicle/.test(type))return 'vehicles';
 if(category.includes('builder furniture')||sku.startsWith('backpack:builder-'))return 'furniture';
 if(category.includes('fishing')||category.includes('utility')||Object.hasOwn(UTILITY_TOOLS,tool)||['brick','spray','repair-tool','recycler'].includes(tool))return 'tools';
 if(item.kind==='tool'||sku.startsWith('tool:')||category.includes('weapons')||/weapon|gear/.test(type))return 'weapons';
 const value=type+' '+category;
 if(/care|consumable|health|hydration|nutrition|recovery/.test(value))return 'care';
 if(/avatar|character/.test(value))return 'avatars';
 if(/vehicle/.test(value))return 'vehicles';
 if(/pet|creature|enemy/.test(value))return 'pets';
 if(/wearable|clothing|accessor/.test(value))return 'wearables';
 if(/land|world|environment|map|terrain/.test(value))return 'lands';
 if(/furniture|interior|room/.test(value))return 'furniture';
 if(/outdoor|plant|nature/.test(value))return 'outdoors';
 if(/prop|model|building|plant|interactive|arcade/.test(value)||item.modelUrl||item.glb_url||item.buildAssetId)return 'props';

 return 'other';
}
export function marketCategoryOptions(items,section){
 const counts=new Map();for(const item of items){const id=marketCategory(item,section);counts.set(id,(counts.get(id)||0)+1);}
 return MARKET_CATEGORIES.filter(category=>counts.has(category.id)).map(category=>({...category,count:counts.get(category.id)}));
}
