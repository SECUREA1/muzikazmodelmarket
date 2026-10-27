import {FACTORY_ID} from './missile-factory-config.js';
import {PROVING_ID,COMPOUND_ID} from './factory-test-config.js';
export const FACTORY_SHIPPING_ID='hormuz-shipping';
export const FACTORY_EXPORT_ROUTE='atlas-export';
const point=(x,z,y=.02)=>({x,y,z});
const station=(id,kind,name,mapId,x,z)=>({id,kind,name,mapId,position:point(x,z),interactionDistance:6});
export const FACTORY_LOGISTICS_STATIONS=Object.freeze([
 station('factory-export','export','Factory export & market desk',FACTORY_ID,-31,48),
 station('range-certification','certify','Official model certification',PROVING_ID,-56,5),
 station('range-receiving','receiving','Proving-ground supply receiving',PROVING_ID,-64,24),
 station('compound-receiving','compound','Mountain facility receiving',COMPOUND_ID,24,31),
 station('logistics-jebel-export','shipping','Jebel Ali sealed-model export',FACTORY_SHIPPING_ID,-1004,390),
 station('shipping-east-receiving','receiving','Fujairah model freight receiving',FACTORY_SHIPPING_ID,1005,728)
]);
export const LOGISTICS_DESTINATIONS=Object.freeze([
 {id:PROVING_ID,name:'Proving Grounds Supply Depot',mapId:PROVING_ID,kind:'delivery',stationKind:'receiving',requiredCertificate:true,minTransitMs:5000},
 {id:COMPOUND_ID,name:'Mountain Facility Supply Hall',mapId:COMPOUND_ID,kind:'delivery',stationKind:'compound',requiredCertificate:true,minTransitMs:10000,requiredClearance:true},
 {id:FACTORY_EXPORT_ROUTE,name:'Atlas Export · Jebel Ali to Fujairah',mapId:FACTORY_SHIPPING_ID,kind:'shipping',stationKind:'shipping',requiredCertificate:true,minTransitMs:5000,contractId:FACTORY_EXPORT_ROUTE,originPortId:'jebel-ali',destinationPortId:'fujairah'}
]);
const terminal=new Set(['delivered','cancelled','returned','failed']);
/** Dependency-free authoritative lock predicate, also safe to import from the
 * wallet database without creating a database/service module cycle. */
export function factoryItemReservation(data,wallet,itemId,now=Date.now()){
 return Object.values(data.factoryLogistics?.itemLocks||{}).find(lock=>lock.walletId===wallet&&lock.itemId===itemId&&!lock.releasedAt&&(lock.expiresAt===undefined||lock.expiresAt>now)&&!terminal.has(data.factoryLogistics?.manifests?.[lock.manifestId]?.status))||null;
}
export const itemLocked=(data,wallet,itemId,now=Date.now())=>Boolean(factoryItemReservation(data,wallet,itemId,now));
const settings=environment=>environment?.builderScene?.sourceFactoryLogistics||environment?.builderScene?.layoutMeta?.factoryLogistics||environment?.factoryLogistics;
const active=value=>value&&value.active!==false&&value.enabled!==false&&value.visible!==false&&!value.disabled&&!value.deleted&&!['disabled','deleted','inactive'].includes(value.status);
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const vector=value=>({x:finite(value?.x??value?.[0]),y:finite(value?.y??value?.[1]),z:finite(value?.z??value?.[2])});
const modelRoles={'factory-export-terminal':'export','factory-certification-kiosk':'certify'};
export const isFactoryLogisticsEnvironment=environment=>FACTORY_LOGISTICS_STATIONS.some(station=>station.mapId===environment?.id)||settings(environment)?.enabled===true||Boolean(environment?.builderScene?.objects?.some(object=>object.functionalSettings?.logisticsStation||modelRoles[object.asset?.buildAssetId||object.modelId]));
function approach(object,value={x:0,y:0,z:3.5}){
 const source=object.transform||object,p=vector(object.position||source.position),r=vector(object.rotation||source.rotation),raw=object.scale||source.scale||{},s=typeof raw==='number'?{x:raw,y:raw,z:raw}:raw,a=vector(value),v={x:a.x*Math.max(.04,Math.min(20,finite(s.x,1))),y:a.y*Math.max(.04,Math.min(20,finite(s.y,1))),z:a.z*Math.max(.04,Math.min(20,finite(s.z,1)))};
 const cx=Math.cos(r.x/2),cy=Math.cos(r.y/2),cz=Math.cos(r.z/2),sx=Math.sin(r.x/2),sy=Math.sin(r.y/2),sz=Math.sin(r.z/2),qx=sx*cy*cz+cx*sy*sz,qy=cx*sy*cz-sx*cy*sz,qz=cx*cy*sz+sx*sy*cz,qw=cx*cy*cz-sx*sy*sz,ix=qw*v.x+qy*v.z-qz*v.y,iy=qw*v.y+qz*v.x-qx*v.z,iz=qw*v.z+qx*v.y-qy*v.x,iw=-qx*v.x-qy*v.y-qz*v.z;
 return {x:p.x+ix*qw+iw*-qx+iy*-qz-iz*-qy,y:p.y+iy*qw+iw*-qy+iz*-qx-ix*-qz,z:p.z+iz*qw+iw*-qz+ix*-qy-iy*-qx};
}
export function logisticsStations(environment,{actors}={}){
 if(!environment||settings(environment)?.enabled===false)return [];
 const authored=Array.isArray(environment.builderScene?.objects)?environment.builderScene.objects:[],ids=new Set(authored.map(object=>object.id)),runtime=Object.values(actors||{}).filter(actor=>actor.spawned&&!ids.has(actor.id)&&!actor.holderId).map(actor=>({...actor,modelId:actor.asset?.buildAssetId||actor.modelId,functionalSettings:{...actor.asset?.function_data,...actor.asset?.configuration,...actor.definition?.gameplay,...actor.functionalSettings}})),objects=[...authored,...runtime],declared=objects.some(object=>Object.hasOwn(object.functionalSettings||{},'logisticsStation')||modelRoles[object.asset?.buildAssetId||object.modelId]);
 if(declared||settings(environment)?.editableStations||settings(environment)?.editableEquipment){const used=new Set();return objects.flatMap((object,index)=>{const f={...object.gameplay,...object.functionalSettings},kind=f.logisticsStation===false?null:typeof f.logisticsStation==='string'?f.logisticsStation:modelRoles[object.asset?.buildAssetId||object.modelId],canonical=FACTORY_LOGISTICS_STATIONS.find(station=>station.kind===kind),id=String(object.id||'object-'+index),actor=actors?.[id];if(!canonical||!active(object)||!active(f)||actor&&(!active(actor)||actor.health<=0||actor.holderId)||used.has(id)||id.length>180||/[\x00-\x1f\x7f]/.test(id))return [];used.add(id);return [{...canonical,id:'logistics-instance:'+id,objectId:id,canonicalId:f.logisticsStationId||canonical.id,kind,mapId:environment.id,name:typeof object.name==='string'?object.name.slice(0,120):canonical.name,position:approach(object,f.logisticsApproach),interactionDistance:Math.max(.5,Math.min(6,finite(f.interactionDistance,6)))}];});}
 if(Array.isArray(settings(environment)?.stations))return settings(environment).stations.filter(active).map(station=>({...station,mapId:environment.id,position:vector(station.position),interactionDistance:Math.max(.5,Math.min(6,finite(station.interactionDistance,6)))}));
 return FACTORY_LOGISTICS_STATIONS.filter(station=>station.mapId===environment.id).map(station=>({...station}));
}
