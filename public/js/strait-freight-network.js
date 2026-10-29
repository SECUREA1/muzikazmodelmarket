import {SHIPPING_ID,SHIPPING_PORTS} from './shipping-config.js';

const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const position=(x,z,y=0)=>({x,y,z});
const runwayCenters=Object.freeze({'jebel-ali':700,'ras-tanura':-900,'bandar-abbas':-900,khasab:650,fujairah:1050});
function connection(port){
 const shore=Math.sign(port.position.z-port.z),dock=position(port.x+15,port.z+shore*22),bay=position(port.x+15,port.position.z+shore*18),z=runwayCenters[port.id];
 const field=Number.isFinite(z)?{id:'freight-airfield-'+port.id,portId:port.id,mapId:SHIPPING_ID,name:port.name.split(' · ')[0]+' freight airfield',x:port.x,z,width:20,length:240,surface:'paved'}:null;
 if(field){
  field.runwayId=field.id;field.runway={id:field.id,name:field.name,x:field.x,z:field.z,width:field.width,length:field.length,surface:field.surface};
  field.cargoApron={...position(field.x-field.width/2-11,z),width:28,depth:160};
  field.truckBay=position(field.cargoApron.x-10,z);
  field.departure=position(field.x,z-field.length/2-45,36);
  field.approach=position(field.x,z+field.length/2+120,30);
 }
 // Turn farther onto shore before passing the dock exchange and berth signs.
 const turnZ=bay.z+shore*18;
 const roadWaypoints=[dock,bay],airRoadWaypoints=field?[bay,position(bay.x,turnZ),position(field.truckBay.x,turnZ),field.truckBay]:[];
 if(field){field.roadWaypoints=roadWaypoints;field.airRoadWaypoints=airRoadWaypoints;field.bay=bay;}
 return {portId:port.id,mapId:SHIPPING_ID,name:port.name,dock,bay,bayId:'strait-freight-bay-'+port.id,roadWaypoints,dockRoadWaypoints:roadWaypoints,airfield:field,airRoadWaypoints,airUnavailableReason:field?null:'Qeshm uses sea and road freight. Its island has no runway long enough for these aircraft.'};
}

/** Authored local shore links only. Different coasts remain separate road
 * networks; sea passages and flights carry freight across the Strait. */
export const STRAIT_FREIGHT_CONNECTIONS=freeze(SHIPPING_PORTS.map(connection));
export function straitPortFreight(portId){return STRAIT_FREIGHT_CONNECTIONS.find(row=>row.portId===portId)||null;}
export const STRAIT_AIR_ROUTES=freeze(STRAIT_FREIGHT_CONNECTIONS.filter(row=>row.airfield).map(row=>{
 const destinationPortId=row.portId==='fujairah'?'jebel-ali':'fujairah',destination=straitPortFreight(destinationPortId).airfield;
 return {id:'air-'+row.portId+'-'+destinationPortId,name:row.airfield.name+' → '+destination.name,mapId:SHIPPING_ID,fromPortId:row.portId,toPortId:destinationPortId,originPortId:row.portId,destinationPortId,origin:row.airfield,destination,from:row.airfield,to:destination,waypoints:[row.airfield.departure,destination.approach]};
}));
export function straitAirRoute(portId){return STRAIT_AIR_ROUTES.find(row=>row.originPortId===portId)||null;}

export const INTERNATIONAL_AIRPORT_FREIGHT=freeze({mapId:'muzikaz-airport',bayId:'airport-factory-cargo-bay',bay:position(-88,-70),cargoApron:position(21,0),truckBay:position(7,0),roadWaypoints:[position(-88,-70),position(7,-70),position(7,0)],gateway:position(-82,-82)});

export function straitFreightStreets(){
 return STRAIT_FREIGHT_CONNECTIONS.flatMap(row=>[
  ...row.roadWaypoints.slice(1).map((to,index)=>({id:'strait-'+row.portId+'-dock-road-'+index,name:row.name.split(' · ')[0]+' dock access',from:row.roadWaypoints[index],to,width:7,speedLimitKph:20})),
  ...row.airRoadWaypoints.slice(1).map((to,index)=>({id:'strait-'+row.portId+'-air-road-'+index,name:row.name.split(' · ')[0]+' air cargo road',from:row.airRoadWaypoints[index],to,width:7,speedLimitKph:25}))
 ]);
}
