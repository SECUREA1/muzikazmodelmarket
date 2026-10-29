/** Reusable forestry assets; simulation permissions remain server controlled. */
const item=(name,description,dimensions,kind,priceMzk,extra={})=>Object.freeze({name,description,dimensions:Object.freeze(dimensions),kind,priceMzk,...extra});
export const FOREST_HARVEST_ITEMS=Object.freeze({
 'forestry-lumber-plank':item('Sawn Timber Plank','A milled board for building and joinery; species and drying provenance travel with earned lumber.',[.28,.06,2.4],'lumber',8),
 'forestry-lumber-beam':item('Structural Timber Beam','A squared timber section for load-bearing frames and posts.',[.24,.24,3.6],'lumber',12),
 'forestry-lumber-panel':item('Wood Panel','A solid edged timber panel for cabinetry, walls and floors.',[1.2,.04,2.4],'lumber',10),
 'forestry-lumber-veneer':item('Finish Veneer Sheet','A thin decorative timber sheet for furniture finishing.',[1.2,.012,1.8],'lumber',6),
 'forestry-lumber-dowel':item('Joinery Dowel','A turned wooden dowel for furniture joints and tool handles.',[.06,.06,1.2],'lumber',3),
 'forestry-axe':item('Felling Axe','A forged steel felling head with an ash handle for selective tree harvesting.',[.5,1.25,.14],'tool',45,{equipment:'axe'}),
 'forestry-chainsaw':item('Forestry Chainsaw','An orange forestry saw with guarded guide bar, chain teeth and wraparound handle.',[.35,.55,1.2],'tool',120,{equipment:'chainsaw'}),
 'forestry-planter':item('Seedling Planter','A planting tube and seedling tray for replacing harvested forest stands.',[.45,1.4,.4],'tool',55,{equipment:'planter'}),
 'forestry-harvester':item('Tracked Tree Harvester','A driveable tracked forestry machine with protected cab, articulated boom and harvesting head.',[3.2,4.6,7.8],'vehicle',680,{equipment:'harvester'}),
 'forestry-forwarder':item('Grapple Forwarder','An eight-wheel driveable forwarder with a grapple boom and timber load bunks.',[3,4,8.4],'vehicle',580,{equipment:'forwarder'}),
 'forestry-log-truck':item('Timber Haul Truck','A driveable six-wheel timber truck with steel stakes and a long timber bed.',[2.9,3.6,10.4],'vehicle',620,{equipment:'log-truck'}),
 'forestry-stump-grinder':item('Stump Grinder','A driveable compact crawler with a guarded rotating stump-cutting wheel.',[2.3,2.8,4.5],'vehicle',380,{equipment:'stump-grinder'}),
 'forestry-sawmill':item('Precision Lumber Mill','A roller-bed sawmill with covered cutting head, timber carriage and operator console.',[9,3.7,5.8],'station',460,{station:'mill'}),
 'forestry-drying-kiln':item('Drying Kiln','A vented drying cabinet with plank racks, heating ducts and a moisture control panel.',[6.2,3.8,5.6],'station',340,{station:'dry'}),
 'forestry-nursery':item('Tree Nursery','A propagation bench holding six timber species, seedling trays and a watering manifold.',[5.5,2.5,3.8],'station',180,{station:'nursery'}),
 'forestry-workbench':item('Timber & Furniture Workshop','A joinery bench with timber vice, clamps, measuring tools and a production board.',[5.2,2.6,3.2],'station',220,{station:'craft'})
});
export const FOREST_HARVEST_MODEL_INFO=Object.freeze(Object.fromEntries(Object.entries(FOREST_HARVEST_ITEMS).map(([id,value])=>[id,[value.name,value.description,value.dimensions]])));
export function forestHarvestItemSettings(id){
 const value=FOREST_HARVEST_ITEMS[id];if(!value)return null;
 return {active:true,behavior:value.kind==='vehicle'?'vehicle':value.kind==='lumber'?'decor':'interact',action:value.kind==='vehicle'?'drive':'none',destructible:false,damage:0,interactionKey:value.kind==='vehicle'?'f':'e',interactionDistance:value.kind==='vehicle'?6:8,forestEquipment:value.equipment||false,forestStation:value.station||false,prompt:(value.kind==='vehicle'?'Drive ':'Use ')+value.name+' · '+(value.kind==='vehicle'?'F':'E / Use')};
}
export function forestHarvestNativeItem(id){
 const value=FOREST_HARVEST_ITEMS[id];if(!value)return null;
 const settings=forestHarvestItemSettings(id);
 return {id,buildAssetId:id,name:value.name,description:value.description,dimensions:value.dimensions,type:value.kind==='vehicle'?'vehicle':value.kind==='tool'?'interactive':'interior',category:value.kind==='vehicle'?'vehicles':value.kind==='tool'?'tools':value.kind==='lumber'?'props':'factory',priceMzk:value.priceMzk,behavior:settings.behavior,action:settings.action,size:86,color:value.kind==='lumber'?'#b18a58':'#e9b548',procedural:true,assetKind:'premade',image:'/public/images/native-designs/'+id+'.svg',function_data:settings};
}
