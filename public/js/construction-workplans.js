import {constructionMachineKind} from './construction-state.js';
import {constructionInteractionPoint} from './construction-access.js';
export const constructionStructure=(site,actor)=>actor?.construction?.structureId==='facility'&&site?.facility?site.facility:site?.tower;
export function constructionMachineChoices(snapshot={},selfId=snapshot.selfId){
 const self=snapshot.players?.[selfId],crew=snapshot.construction?.crew?.workers||[];
 return Object.values(snapshot.actors||{}).filter(actor=>actor.active!==false&&actor.health!==0&&constructionMachineKind(actor)).map(actor=>{
  const point=constructionInteractionPoint(actor,self?.position),distance=self?.position&&point?Math.hypot(point.x-self.position.x,point.y-self.position.y,point.z-self.position.z):Infinity,operator=crew.find(worker=>worker.id===actor.construction?.crewOperator?.workerId),selected=self?.vehicleId===actor.id;
  const reason=!self||self.health<=0?'Join the live site to operate machinery.':selected?'You are operating this machine.':self.vehicleId?'Exit your current machine before selecting another.':actor.holderId?'Another player is operating this machine.':distance>5?'Walk to the machine cab to operate it.':'';
  return {id:actor.id,kind:constructionMachineKind(actor),name:actor.name||actor.asset?.name||({crane:'Tower crane',excavator:'Hydraulic excavator',truck:'Articulated dump truck',bulldozer:'Crawler bulldozer'}[constructionMachineKind(actor)]),distance,selected,available:!reason,reason,operator:operator?.name||null};
 }).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
}
export function constructionWorkAreas(site,type){
 if(type==='steel')return [['tower','Skyscraper'],...(site?.facility?[['facility','Facility steel frame']]:[])];
 if(type==='load')return [];
 return (site?.earthworks?.patches||[]).filter(patch=>type!=='dig'||patch.kind==='excavation'||patch.kind==='stockpile').map(patch=>[patch.id,patch.id.replaceAll('-',' ')]);
}
