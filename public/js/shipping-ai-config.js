import {SHIPPING_PORTS,SHIPPING_ROUTES} from './shipping-config.js';

export const SHIPPING_RIVAL_VERSION=1;
export const SHIPPING_RIVAL_RULES=Object.freeze({handlingFloorMs:1500,dispatchMs:4000,securingMs:2500,maxStepSeconds:.25,berthOffset:180,entryOffset:280,seawardOffset:85,warehouseTarget:48,warehouseProductionMs:15000,maxWarehouseStock:240});
export function shippingCommercialBerth(portId){
 const port=SHIPPING_PORTS.find(port=>port.id===portId);if(!port)return null;
 const side=portId==='bandar-abbas'?-1:1;
 return {id:port.id+'-commercial',portId:port.id,x:port.x+side*180,y:0,z:port.z,yaw:side<0?-Math.PI/2:Math.PI/2,side,entry:{x:port.x+side*280,z:port.z},seaward:{x:port.x+side*280,z:port.z-Math.sign(port.position.z-port.z)*85}};
}
export const SHIPPING_RIVAL_PROFILES=Object.freeze([
 {id:'gulf-link',companyName:'Gulf Link Logistics',captainName:'Captain Layla Noor',callsign:'Gulf Link 21',name:'Gulf Link Runner',modelId:'shipping-feeder',color:'#64d8bb',handlingMs:1800,speedFactor:.94,homePortId:'jebel-ali',routeIds:['dock-induction','island-provisions','ai-qeshm-return']},
 {id:'oman-freight',companyName:'Oman Freight Cooperative',captainName:'Captain Samir Haddad',callsign:'Oman Freight 42',name:'Oman Freight Venture',modelId:'shipping-container',color:'#f0b96e',handlingMs:2100,speedFactor:.91,homePortId:'ras-tanura',routeIds:['northern-materials','ai-northern-return']},
 {id:'strait-relief',companyName:'Strait Relief Shipping',captainName:'Captain Maya Rahim',callsign:'Relief Mariner 7',name:'Relief Mariner',modelId:'shipping-tanker',color:'#a9b8f5',handlingMs:1600,speedFactor:.89,homePortId:'fujairah',routeIds:['oman-machinery','ai-eastern-return']}
].map(profile=>Object.freeze(profile)));
const reverse=(id,name,source,from,to,cargoId,units)=>{const route=SHIPPING_ROUTES.find(route=>route.id===source);return {id,name,from,to,cargoId,units,waypoints:route.waypoints.slice(1,-2).toReversed().map(point=>({...point,name:'Return passage · '+(point.name||'channel mark')})),aiRoute:true,coreOnly:true};};
export const SHIPPING_RIVAL_ROUTES=Object.freeze([
 ...SHIPPING_ROUTES,
 {id:'ai-qeshm-return',name:'Gulf Link island backhaul',from:'qeshm',to:'jebel-ali',cargoId:'building-supplies',units:4,aiRoute:true,coreOnly:true,waypoints:[{x:-80,z:-180,name:'Qeshm departure'},{x:-250,z:-100,name:'Join the westbound Gulf lane'},{x:-700,z:-160,name:'Inbound western Gulf lane'},{x:-1180,z:-160,name:'Western traffic turning point'},{x:-1180,z:180,name:'Jebel Ali western approach'},{x:-1180,z:220,name:'Gateway cargo basin'}]},
 reverse('ai-northern-return','Northern machinery backhaul','northern-materials','bandar-abbas','ras-tanura','building-supplies',8),
 {...SHIPPING_ROUTES.find(route=>route.id==='gulf-gateway'),id:'ai-eastern-return',name:'Relief supplies eastbound',cargoId:'relief-supplies',units:12,aiRoute:true}
]);
export const shippingRivalRoute=id=>SHIPPING_RIVAL_ROUTES.find(route=>route.id===id)||null;
