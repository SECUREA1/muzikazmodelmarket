/** Canonical forest game data. Quantities represent game units, distances metres. */
export const FOREST_HARVEST_ID='forest-harvest';
export const FOREST_GROWTH_MS=90_000;
export const FOREST_MILL_MS=4_000;
export const FOREST_DRY_MS=6_000;
export const FOREST_SPECIES=Object.freeze({
 pine:{id:'pine',name:'Pine',color:'#789a4c',woodColor:'#c39a62',logs:4,height:13},
 oak:{id:'oak',name:'Oak',color:'#467a3c',woodColor:'#ae8151',logs:5,height:12},
 birch:{id:'birch',name:'Birch',color:'#8fba55',woodColor:'#e3c89a',logs:3,height:11},
 cedar:{id:'cedar',name:'Cedar',color:'#32664e',woodColor:'#b7774f',logs:4,height:14},
 walnut:{id:'walnut',name:'Walnut',color:'#5a7942',woodColor:'#72503a',logs:4,height:12},
 spruce:{id:'spruce',name:'Spruce',color:'#2e6951',woodColor:'#d3b981',logs:4,height:15}
});
const point=(x,z)=>({x,y:.02,z});
export const FOREST_PLOTS=Object.freeze([
 {id:'pine-ridge',name:'Pine Ridge',center:point(-66,-30),width:76,depth:40},
 {id:'hardwood-grove',name:'Hardwood Grove',center:point(62,-30),width:76,depth:40},
 {id:'cedar-hollow',name:'Cedar Hollow',center:point(-66,-92),width:76,depth:40},
 {id:'reclamation',name:'East Reclamation Lot',center:point(62,-92),width:76,depth:40}
]);
export const FOREST_TREES=Object.freeze(FOREST_PLOTS.flatMap((plot,plotIndex)=>Array.from({length:12},(_,index)=>{
 const x=plot.center.x+(index%4-1.5)*16,z=plot.center.z+(Math.floor(index/4)-1)*13;
 const speciesId=plotIndex===0?['pine','spruce'][index%2]:plotIndex===1?['oak','birch','walnut'][index%3]:plotIndex===2?['cedar','spruce'][index%2]:['oak','pine','birch'][index%3];
 return {id:plot.id+'-'+(index+1),speciesId,plotId:plot.id,position:point(x,z)};
})));
export const FOREST_STATIONS=Object.freeze([
 {id:'forest-mill',kind:'mill',name:'Precision Lumber Mill',position:point(32,18),approach:point(32,26)},
 {id:'forest-kiln',kind:'dry',name:'Drying Kiln',position:point(50,18),approach:point(50,26)},
 {id:'forest-workbench',kind:'craft',name:'Timber & Furniture Workshop',position:point(50,38),approach:point(50,44)},
 {id:'forest-nursery',kind:'nursery',name:'Tree Nursery',position:point(-42,40),approach:point(-42,46)},
 {id:'forest-tool-depot',kind:'equipment',name:'Logging Equipment Depot',position:point(-18,40),approach:point(-18,46)}
]);
export const FOREST_EQUIPMENT=Object.freeze({
 axe:{id:'axe',name:'Felling Axe',power:1,reach:5,capacity:2,kind:'tool'},
 chainsaw:{id:'chainsaw',name:'Forestry Chainsaw',power:2,reach:6,capacity:2,kind:'tool'},
 harvester:{id:'harvester',name:'Tracked Tree Harvester',power:4,reach:12,capacity:4,kind:'vehicle'},
 forwarder:{id:'forwarder',name:'Grapple Forwarder',power:0,reach:12,capacity:12,kind:'vehicle'},
 'log-truck':{id:'log-truck',name:'Timber Haul Truck',power:0,reach:9,capacity:24,kind:'vehicle'},
 'stump-grinder':{id:'stump-grinder',name:'Stump Grinder',power:0,reach:6,capacity:2,kind:'vehicle'},
 planter:{id:'planter',name:'Seedling Planter',power:0,reach:7,capacity:2,kind:'tool'}
});
export const FOREST_VEHICLES=Object.freeze([
 {id:'forest-harvester',kind:'harvester',name:'Tracked Tree Harvester',position:point(-24,24),capacity:4},
 {id:'forest-forwarder',kind:'forwarder',name:'Grapple Forwarder',position:point(-38,24),capacity:12},
 {id:'forest-log-truck',kind:'log-truck',name:'Timber Haul Truck',position:point(-54,24),capacity:24},
 {id:'forest-stump-grinder',kind:'stump-grinder',name:'Stump Grinder',position:point(-68,24),capacity:2}
]);
export const FOREST_PRODUCTS=Object.freeze({
 plank:{id:'plank',name:'Sawn Planks',yield:4,description:'General building and furniture boards.'},
 beam:{id:'beam',name:'Structural Beams',yield:2,description:'Heavy posts and frames.'},
 panel:{id:'panel',name:'Wood Panels',yield:2,description:'Floors, walls and cabinets.'},
 veneer:{id:'veneer',name:'Finish Veneer',yield:6,description:'Thin decorative sheets for crafted items.'},
 dowel:{id:'dowel',name:'Joinery Dowels',yield:8,description:'Furniture joints and item handles.'}
});
export const FOREST_RECIPES=Object.freeze({
 'timber-wall':{id:'timber-wall',name:'Timber Wall',modelId:'material:wall',category:'building',cost:{plank:8,beam:2}},
 'timber-floor':{id:'timber-floor',name:'Timber Floor',modelId:'material:floor',category:'building',cost:{panel:4,beam:2}},
 'timber-roof':{id:'timber-roof',name:'Timber Roof',modelId:'material:roof',category:'building',cost:{plank:6,beam:2}},
 'garden-fence':{id:'garden-fence',name:'Garden Fence',modelId:'material:fence',category:'building',cost:{plank:4,dowel:4}},
 'dining-table':{id:'dining-table',name:'Hardwood Table',modelId:'material:table',category:'furniture',cost:{plank:6,dowel:4}},
 'park-bench':{id:'park-bench',name:'Park Bench',modelId:'material:bench',category:'furniture',cost:{plank:4,beam:2}},
 bookshelf:{id:'bookshelf',name:'Bookshelf',modelId:'material:shelf',category:'furniture',cost:{panel:4,plank:4}},
 'storage-crate':{id:'storage-crate',name:'Storage Crate',modelId:'material:crate',category:'item',cost:{plank:4,dowel:4}},
 planter:{id:'planter',name:'Garden Planter',modelId:'material:planter',category:'item',cost:{plank:4}},
 'display-counter':{id:'display-counter',name:'Veneered Display Counter',modelId:'material:counter',category:'furniture',cost:{panel:4,veneer:6,dowel:4}}
});
export const FOREST_CHALLENGES=Object.freeze([
 {id:'first-harvest',name:'First Harvest',description:'Fell and buck three trees.',stat:'harvested',target:3},
 {id:'mill-master',name:'Mill Master',description:'Mill 40 lumber units from harvested logs.',stat:'milled',target:40},
 {id:'furniture-maker',name:'Furniture Maker',description:'Craft three furniture or building items.',stat:'crafted',target:3},
 {id:'land-reclaimer',name:'Land Reclaimer',description:'Grind 12 stumps and clear one entire forest plot.',stat:'clearedPlots',target:1},
 {id:'new-growth',name:'New Growth',description:'Plant and mature four replacement trees.',stat:'regrown',target:4}
]);
export const isForestHarvestEnvironment=environment=>environment?.id===FOREST_HARVEST_ID||environment?.game==='forest-harvest'||environment?.forestHarvest?.enabled===true||environment?.builderScene?.layout==='forest-harvest'||environment?.builderScene?.layoutMeta?.forestHarvest?.enabled===true;
