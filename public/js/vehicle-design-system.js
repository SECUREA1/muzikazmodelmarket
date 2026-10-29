import {VEHICLE_DESIGN_VERSION,VEHICLE_DESIGN_IDS,isCraftedVehicleDesign} from './vehicle-design-profile.js';
import {createVehicleDesignKit,addVehicleSurfaceUvs} from './vehicle-design-kit.js';
import {finishNativeSurfaces} from './native-surface-finish.js';
import {finishTransportDesign} from './transport-design-finish.js';
import {VEHICLE_ROAD_DESIGN_IDS,finishVehicleRoadDesign} from './vehicle-road-design.js';
import {VEHICLE_AIR_MARINE_DESIGN_IDS,finishVehicleAirMarineDesign} from './vehicle-air-marine-design.js';
import {VEHICLE_INDUSTRIAL_DESIGN_IDS,finishVehicleIndustrialDesign} from './vehicle-industrial-design.js';

export {VEHICLE_DESIGN_VERSION,VEHICLE_DESIGN_IDS};
export const supportsVehicleDesign=isCraftedVehicleDesign;
const road=new Set(VEHICLE_ROAD_DESIGN_IDS),airMarine=new Set(VEHICLE_AIR_MARINE_DESIGN_IDS),industrial=new Set(VEHICLE_INDUSTRIAL_DESIGN_IDS);

export function finishVehicleDesign(T,root,id){
 if(!root||!isCraftedVehicleDesign(id)||root.userData.vehicleDesign?.version===VEHICLE_DESIGN_VERSION&&root.userData.vehicleDesign.id===id)return root;
 // A placed funhouse car is also available wrapped with its display court. Its
 // actual moving assembly is already finished; retain that work once wrapped.
 let finishedChild;
 root.traverse(node=>{if(node!==root&&node.userData.vehicleDesign?.version===VEHICLE_DESIGN_VERSION&&node.userData.vehicleDesign.id===id)finishedChild=node;});
 if(finishedChild){root.userData.vehicleDesign={...finishedChild.userData.vehicleDesign};return root;}
 finishTransportDesign(T,root,id);
 const kit=createVehicleDesignKit(T,root,id);let family;
 let uvGeometries=addVehicleSurfaceUvs(T,root);
 if(road.has(id)){family='road';finishVehicleRoadDesign(T,root,id,kit);}
 else if(airMarine.has(id)){family='air-marine';finishVehicleAirMarineDesign(T,root,id,kit);}
 else if(industrial.has(id)){family='industrial-rides';finishVehicleIndustrialDesign(T,root,id,kit);}
 else throw new Error('Missing crafted vehicle family: '+id);
 uvGeometries+=addVehicleSurfaceUvs(T,root);
 finishNativeSurfaces(T,root,id);kit.disposeUnusedMaterials();
 let meshCount=0,triangles=0;root.traverse(node=>{if(node.isMesh){meshCount++;triangles+=(node.geometry?.index?.count||node.geometry?.attributes.position?.count||0)/3*(node.isInstancedMesh?node.count:1);}});
 root.userData.vehicleDesign={version:VEHICLE_DESIGN_VERSION,id,family,...kit.stats(),uvGeometries,meshCount,triangles};
 return root;
}
