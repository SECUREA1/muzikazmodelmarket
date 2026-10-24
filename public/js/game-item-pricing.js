export const MZK_PER_USD=100;
export const usdEquivalent=mzk=>'$'+(Number(mzk)/MZK_PER_USD).toFixed(2);
export function catalogItemPrice(item){
 if(item.basic)return 0;
 if(String(item.buildAssetId||'').startsWith('fitness-'))return Math.max(10,Math.min(1000,Number(item.priceMzk)||50));
 if(String(item.buildAssetId||'').startsWith('factory-'))return Math.max(10,Math.min(1000,Number(item.priceMzk)||50));
 if(item.productTier==='luxury')return Math.max(10,Math.min(1000,Number(item.priceMzk)||100));
 const name=(item.buildAssetId||item.name||item.id||'').toLowerCase(),type=item.assetType||item.type;
 if(item.kind==='material'){const id=item.materialId||'';return /wall/.test(id)?5:/gold|crystal/.test(id)?50:/metal|copper|marble|granite|steps/.test(id)?20:/glass|ice|door|window/.test(id)?15:10;}
 if(/modular-wall|wall-piece/.test(name))return 5;
 if(/armchair|chair|pillow-ring/.test(name))return 25;
 if(/bench/.test(name))return 35;
 if(/coffee-table|planter|lamp-post|floor-lamp|path-tile/.test(name))return 25;
 if(/sofa|bookshelf|wardrobe|dining-set/.test(name))return 75;
 if(/door|window|roof/.test(name)&&item.buildAssetId)return 15;
 if(/elevator/.test(name))return 350;
 if(item.kind==='tool')return Math.max(10,Math.min(1000,item.priceMzk||200));
 if(type==='vehicles'||type==='vehicle')return 750;
 if(type==='avatars'||type==='avatar'||type==='character')return 300;
 if(type==='pets'||type==='creature')return 150;
 if(type==='wearables')return 50;
 if(type==='lands'||/room|studio|suite|courtyard|building/.test(name))return 500;
 if(item.category==='Models')return 500;
 return Math.max(10,Math.min(1000,item.priceMzk||50));
}
export function materialBulkQuote(item,quantity){
 if(!item||item.kind!=='material'||item.basic)throw Object.assign(Error('Choose a paid building material.'),{statusCode:400});
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000)throw Object.assign(Error('Choose 1 to 1,000 material pieces.'),{statusCode:400});
 const unitPriceMzk=item.unitPriceMzk,discountPercent=quantity>=100?20:quantity>=50?10:0,subtotalMzk=unitPriceMzk*quantity,priceMzk=Math.ceil(subtotalMzk*(100-discountPercent)/100);
 return {sku:item.sku,quantity,unitPriceMzk,discountPercent,subtotalMzk,priceMzk,savingsMzk:subtotalMzk-priceMzk};
}
export const LAND_VALUES=Object.freeze({
 'skyline-deck':{size:32,type:'Rooftop plot',priceMzk:5000},'crew-plaza':{size:48,type:'Social plaza',priceMzk:6500},'studio-ridge':{size:64,type:'Creative district',priceMzk:8000},'echo-gardens':{size:80,type:'Garden estate',priceMzk:10000},'neon-docks':{size:96,type:'Waterfront district',priceMzk:12500},'bassline-badlands':{size:120,type:'Adventure terrain',priceMzk:15000},'volt-city':{size:160,type:'City district',priceMzk:20000},'pixel-peaks':{size:200,type:'Mountain region',priceMzk:25000}
});
