const publicMultiplayerWorld=world=>world?.visibility==='public'&&world.playable!==false&&world.multiplayer===true&&world.sharedWorld!==false&&world.builderScene?.gameplay?.multiplayer!==false;
const position=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z)?{x:point.x,y:Number.isFinite(point.y)?point.y:0,z:point.z}:undefined;
const present=(player,now)=>player&&!player.basketballAI&&!player.isAI&&!player.replacedByRoom&&player.health>0&&Number.isFinite(player.lastSeen)&&now-player.lastSeen<15000;

// Only public job offers are projected. Local conversations and arbitrary
// transport messages never enter the world-wide broadcast feed.
export function worldRadioCalls(rooms,environments,now=Date.now()){
 const calls=[];
 for(const world of environments){
  if(!publicMultiplayerWorld(world))continue;
  const sim=rooms[world.roomId||world.id]?.simulation;if(!sim)continue;
  const destination={worldId:world.id,worldName:world.name||world.id};
  const dispatch=sim.liveDispatch;
  if(dispatch?.id&&dispatch.questId&&Number.isFinite(dispatch.expires)&&dispatch.expires>now){
   const offer=sim.questOffers?.find(offer=>offer.id===dispatch.questId),description=dispatch.description||offer?.description||'';
   calls.push({id:world.id+':'+dispatch.id,type:'ai',...destination,questId:dispatch.questId,title:dispatch.title,description,mode:dispatch.mode,speaker:dispatch.speaker||'Dispatch',at:dispatch.at??Math.max(0,dispatch.expires-90000),expires:dispatch.expires,position:position(dispatch.point),text:(dispatch.title||'New job')+'. '+(description?description+' ':'')+'Volunteers requested at '+destination.worldName+'.'});
  }
  for(const [leaderId,leader]of Object.entries(sim.players||{})){
   const quest=leader.vehicleMission,expires=quest?.helpExpires??quest?.deadline;
   if(!present(leader,now)||!quest?.shared||quest.teamLeader||quest.siteWork||quest.status!=='active'||!quest.instanceId||!quest.questId||!Number.isFinite(quest.deadline)||quest.deadline<=now||!Number.isFinite(expires)||expires<=now)continue;
   const members=Object.keys(quest.team||{}).length;if(members>=4)continue;
   const point=quest.checkpoints?.[quest.index],target=point?.actorId?sim.actors?.[point.actorId]?.position:point;
   calls.push({id:world.id+':team:'+quest.instanceId,type:'player',...destination,teamId:quest.instanceId,questId:quest.questId,leaderId,leader:leader.username||'Player',speaker:leader.username||'Player',title:quest.title,mode:quest.requiredMode||quest.mode,members,at:quest.helpRequestedAt??quest.startedAt??0,expires,position:position(target)||position(leader.position),text:(leader.username||'Player')+' is requesting help with '+quest.title+' at '+destination.worldName+'.'});
  }
 }
 return calls.sort((a,b)=>(a.type==='player'?0:1)-(b.type==='player'?0:1)||b.at-a.at||a.id.localeCompare(b.id)).slice(0,24);
}
