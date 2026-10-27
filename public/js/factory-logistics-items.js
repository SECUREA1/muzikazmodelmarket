/** Logistics assets use the existing factory catalog and shared MZK economy. */
const item=(name,description,dimensions,priceMzk,role=null)=>Object.freeze({name,description,dimensions:Object.freeze(dimensions),priceMzk,role,approach:Object.freeze({x:0,y:.02,z:3.5}),thumbnailUrl:'/public/images/factory/missile-factory.svg'});
export const FACTORY_LOGISTICS_ITEMS=Object.freeze({
 'factory-export-terminal':item('Factory Export Terminal','Trade and export certified game items from a freight desk with shipment screens and an MZK payment panel.',[6,2.6,3],240,'export'),
 'factory-certification-kiosk':item('Factory Certification Kiosk','Review production-test certification at a configurable kiosk with a test matrix, status display and operator desk.',[4,3,2],180,'certify'),
 'factory-freight-crate':item('Factory Freight Crate','A reusable cargo prop with reinforced corners, locking straps and a marked shipping label.',[2,1.8,2],70)
});
export function factoryLogisticsItemSettings(id){
 const value=FACTORY_LOGISTICS_ITEMS[id];if(!value)return null;
 return {active:true,behavior:value.role?'interact':'decor',logisticsStation:value.role||false,...(value.role?{logisticsApproach:{...value.approach},interactionKey:'e',interactionDistance:6,prompt:'Open '+value.name+' · E / Use'}:{}),destructible:false,damage:0};
}
