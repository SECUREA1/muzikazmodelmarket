import {QUARRY_ID,QUARRY_MATERIALS,quarryMaterialItem,quarryConfig} from './quarry-config.js';

export function quarryMarketUrl(material,mapId=QUARRY_ID){
 return '/model-explorer.html?environment='+encodeURIComponent(mapId)+'&autoplay=1&quarryMaterial='+encodeURIComponent(material);
}
const processes={sand:'Gravel screening',fines:'Gravel screening and stone crushing',stone:'Gravel screening',crushed:'Screened stone crushing',topsoil:'Topsoil screening',mulch:'Topsoil screening · organic separation'};
const stock=value=>Number.isSafeInteger(value)&&value>0?value:0;
// Public trading offers read only booked warehouse units. Earth still in the
// pit, plant buffers, loose piles, personal deeds and reserved freight are not
// advertised as stock that another buyer can purchase.
export function quarryMarketCatalog(ledger={},maps=[]){
 const sources=maps.filter(map=>map.id&&!map.memberPlot&&(!map.visibility||map.visibility==='public')&&!map.hidden&&!map.internal&&map.playable!==false&&quarryConfig(map)?.enabled);
 return Object.keys(QUARRY_MATERIALS).map(material=>{
  const item=quarryMaterialItem(material),warehouses=sources.map(map=>({mapId:map.id,name:map.name||map.id,availableStock:stock(ledger.maps?.[map.id]?.stock?.[item.supplyId]),orderUrl:quarryMarketUrl(material,map.id)})),availableStock=warehouses.reduce((sum,source)=>sum+source.availableStock,0),preferred=warehouses.reduce((best,source)=>!best||source.availableStock>best.availableStock?source:best,null);
  return {...item,factoryVariant:undefined,source:'quarry',category:'Building materials · Quarry',unit:'m³',unitPriceMzk:item.priceMzk,availableStock,warehouses,process:processes[material],description:processes[material]+'. Finite mined material, sold by the cubic metre and shipped to your owned deed after payment. Loose stock must be processed and booked before sale.',factoryProducible:false,fulfillment:'quarry-deed-freight',purchaseOperation:'order-quarry',visitUrl:preferred?.orderUrl||quarryMarketUrl(material),orderUrl:preferred?.orderUrl||quarryMarketUrl(material),sourceMapId:preferred?.mapId||QUARRY_ID};
 });
}
export function quarryMarketStockLabel(item){
 return Number(item.availableStock||0).toLocaleString()+' m³ available'+(item.warehouses?.length>1?' across '+item.warehouses.length+' quarry warehouses':'')+' · '+Number(item.unitPriceMzk??item.priceMzk??0).toLocaleString()+' MZK / m³';
}
