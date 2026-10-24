const actorSets=new Map(),boot=globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random();let actorSetSequence=0;
// Opt-in compact heartbeats retain dynamic actors and all actor identities.
// Full action replies remain the recovery baseline; scenery and unchanged
// earth are hydrated locally before any gameplay renderer sees a snapshot.
export function compactRoomSnapshot(state,request={},environment={}){
 // Manual hydraulic heartbeats acknowledge the command without retransmitting
 // the city, crew and terrain. Regular input snapshots keep the scene current.
 if(request.action==='construction-controls'&&request.operation==='control'&&request.controlResponse==='ack'){
  const self=state.players?.[state.selfId],actor=state.actors?.[self?.vehicleId];
  return {constructionControlAck:true,authoritative:true,selfId:state.selfId,sequence:state.sequence,serverTime:state.serverTime,inputEpoch:state.inputEpoch??state.result?.inputEpoch,entityId:actor?.id,axes:actor?.construction?.axes||{},result:state.result};
 }
 if(request.snapshotMode!=='compact'||!['input','construction-controls'].includes(request.action))return state;
 if(state.sceneVersion&&request.sceneVersion!==state.sceneVersion)return state;
 const authored=new Map((environment.builderScene?.objects||environment.placementScene?.objects||[]).map(object=>[object.id,object.functionalSettings||object.gameplay||{behavior:object.behavior||'decor'}]));
 const actors=Object.fromEntries(Object.entries(state.actors||{}).filter(([id,a])=>{const config=a.definition?.gameplay||authored.get(id);return !config||config.behavior!=='decor'||a.constructionManaged||a.resident||a.trafficAI||a.active===false||a.open===true||a.switched===true||config.action&&config.action!=='none'||a.holderId||a.health!=null&&a.health!==(config.health??100);}));
 const actorIds=Object.keys(state.actors||{}),key=actorIds.join('\0');let revision=actorSets.get(key);if(!revision){revision=boot+':'+ ++actorSetSequence;actorSets.set(key,revision);while(actorSets.size>64)actorSets.delete(actorSets.keys().next().value);}
 const result={...state,actors,actorsPartial:true,actorSetRevision:revision,...(request.actorSetRevision===revision?{}:{actorIds})};
 if(state.construction?.earthworks&&request.earthworksRevision===state.construction.earthworks.revision)result.construction={...state.construction,earthworks:null,earthworksUnchanged:true};
 return result;
}
export function hydrateRoomSnapshot(state,previous){
 if(!state.actorsPartial&&!state.construction?.earthworksUnchanged)return state;
 let actors=state.actors;
 if(state.actorsPartial){actors={};for(const id of state.actorIds||Object.keys(previous?.actors||{}))if(state.actors[id]||previous?.actors?.[id])actors[id]=state.actors[id]||previous.actors[id];}
 const construction=state.construction?.earthworksUnchanged?{...state.construction,earthworks:previous?.construction?.earthworks}:state.construction;
 return {...state,actors,construction};
}
