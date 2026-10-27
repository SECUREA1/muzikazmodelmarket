// Cargo stock is earned by completing authoritative deliveries. Exchange it at
// a shipping port for items from the same catalogue used by Tools and Builder.
export const SHIPPING_STOCK_ITEMS=Object.freeze([
 {id:'shipping-food-stock',name:'Delivered provisions',color:'#eab66c',description:'Food and relief stock earned by shipping. Exchange one unit at a port for a Medkit unlock or ten wood building pieces.'},
 {id:'shipping-parts-stock',name:'Delivered machine parts',color:'#71c7da',description:'Industrial stock earned by shipping. Exchange one unit at a port for five prepaid metal building pieces or a 20 MZK credit toward your next factory production order.'},
 {id:'shipping-tools-stock',name:'Delivered tool stock',color:'#a6dfb0',description:'Tool stock earned by shipping. Exchange one unit at a port to unlock the Scanner or a professional fishing rod.'}
].map(item=>Object.freeze({...item,sku:'stock:'+item.id,shippingSupplyId:item.id,kind:'stock',assetType:'supplies',type:'shipping-stock',category:'Shipping stock & supplies',renderKind:'shipping-stock',thumbnailUrl:'/public/images/shipping/'+item.id+'.svg',earnedOnly:true,tradable:false,priceMzk:0,useCostMzk:0})));

export const SHIP_STOCK_TRADES=Object.freeze([
 {id:'provisions-medkit',stockId:'shipping-food-stock',sku:'tool:medkit',quantity:1,name:'Unlock Medkit'},
 {id:'provisions-timber',stockId:'shipping-food-stock',sku:'material:wood',quantity:10,name:'10 wood building pieces'},
 {id:'parts-metal',stockId:'shipping-parts-stock',sku:'material:metal',quantity:5,name:'5 metal building pieces'},
 {id:'parts-production',stockId:'shipping-parts-stock',sku:'factory:production-credit',quantity:1,name:'20 MZK factory production credit',productionCreditMzk:20},
 {id:'tools-scanner',stockId:'shipping-tools-stock',sku:'tool:scanner',quantity:1,name:'Unlock Scanner'},
 {id:'tools-rod',stockId:'shipping-tools-stock',sku:'tool:fishing-pro-rod',quantity:1,name:'Unlock professional fishing rod'}
].map(trade=>Object.freeze({...trade,cost:1})));

export function shippingStockQuantity(state,stockId){
 return Math.max(0,(state?.items||[]).filter(item=>item.shippingSupplyId===stockId).reduce((total,item)=>total+(Number.isSafeInteger(item.quantity)&&item.quantity>0?item.quantity:0),0));
}
