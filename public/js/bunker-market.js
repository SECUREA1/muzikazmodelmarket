export const BUNKER_MARKET_KITS=Object.freeze([
 {id:'seal',name:'Sealed shelter',description:'Build a protected entrance and keep filtered air running below ground.',items:['bunker-access-stairs','bunker-blast-shutter','bunker-filtration-unit','bunker-power-core']},
 {id:'command',name:'Alert & command',description:'Place a crew console, visible alarm beacon, radiation display and secure relay.',items:['bunker-alert-console','bunker-alarm-beacon','bunker-radiation-monitor','bunker-signal-relay']},
 {id:'survival',name:'Crew survival',description:'Stock your underground habitat with medical, water, food and reserve storage.',items:['bunker-emergency-locker','bunker-water-reserve','bunker-med-station','bunker-hydroponics']}
]);
export function isBunkerMarketItem(item){return String(item?.buildAssetId||'').startsWith('bunker-')||item?.worldId==='underground-bunker'&&item?.source==='native-map';}
export function bunkerMarketKits(items){
 const byModel=new Map(items.filter(item=>item.sku).map(item=>[item.buildAssetId,item]));
 return BUNKER_MARKET_KITS.map(kit=>({...kit,items:kit.items.map(id=>byModel.get(id)).filter(Boolean)})).filter(kit=>kit.items.length);
}
