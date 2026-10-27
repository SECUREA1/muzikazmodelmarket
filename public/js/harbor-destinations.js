import {fishingZones} from './fishing-config.js';
import {isShippingEnvironment,SHIPPING_PORTS} from './shipping-config.js';
import {harborForEnvironment} from './harbor-water.js';
import {isTropicalIslandEnvironment} from './tropical-island-config.js';
// Display centers only; navigation chooses safe water-side approaches.
export function harborDestinations(environment,vehicle=null){
 const meta=environment?.builderScene?.layoutMeta,harbor=harborForEnvironment(environment);if(!harbor)return [];
 if(isTropicalIslandEnvironment(environment))return [{id:'open-water',name:'Palm Coast open water',...harbor.openWater},...harbor.docks.map(({id,name,approach})=>({id,name,...approach}))];
 if(isShippingEnvironment(environment))return SHIPPING_PORTS.map(port=>({id:port.id,name:port.name,x:port.x,z:port.z,kind:'shipping-port'}));
 const lake=(harbor.lakes||[]).find(lake=>vehicle?.position&&Math.abs(vehicle.position.x-lake.x)<lake.width/2&&Math.abs(vehicle.position.z-lake.z)<lake.depth/2);
 if(lake)return [{id:'open-water',name:lake.name+' open water',x:lake.x+lake.width*.25,z:lake.z+lake.depth*.2},{id:lake.id,name:lake.name+' pier',x:lake.x-lake.width/2+7,z:lake.z+5},...fishingZones(environment).filter(zone=>zone.water==='fresh'&&Math.abs(zone.x-lake.x)<lake.width/2&&Math.abs(zone.z-lake.z)<lake.depth/2)];
 const marina=(meta.locations||[]).find(place=>place.id==='marina')||{id:'marina',name:'Neon Marina',x:132,z:30};
 return [{id:'open-water',name:'Open water',x:184,z:80},{id:marina.id,name:marina.name,x:marina.x,z:marina.z},...(harbor.docks||[]).map(({id,name,x,z})=>({id,name,x,z})),...fishingZones(environment).filter(zone=>zone.water==='salt'),...(vehicle?.modelId==='harbor-yacht'?[]:harbor.islands||[]).map(({id,name,x,z})=>({id,name,x,z}))];
}
