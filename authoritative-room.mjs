import {createHash} from 'node:crypto';
import {ServerBuilderCollision} from './server-builder-collision.mjs';
import {RANGED_WEAPONS} from './public/js/game-weapons.js';
import {UTILITY_TOOLS} from './public/js/game-utilities.js';
import {compileBuilderScene} from './public/js/builder-gameplay-pipeline.js';
import {buildingDimensions,buildingMaterial} from './public/js/building-materials.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(message,statusCode=400,code)=>{throw Object.assign(new Error(message),{statusCode,code});};
const damageByTool={laser:20,bat:25,taser:8,toxin:12,dynamite:60,flamethrower:15,'pulse-rifle':18,shotgun:35,marksman:45};
export class AuthoritativeRooms {
 constructor({store,now=Date.now,charge=async()=>{},resolveAsset=async()=>null,reward=async()=>{},telemetry=async()=>{},capacity=32}){Object.assign(this,{store,now,charge,resolveAsset,reward,telemetry,capacity});this.collision=new ServerBuilderCollision();}
 initialize(room,environment){
  const manifest=compileBuilderScene(environment.builderScene||{});
  room.simulation ||= {version:1,players:{},actors:{},events:[],time:this.now(),sequence:0};
  const sim=room.simulation,contentUpdatedAt=environment.contentUpdatedAt||environment.updatedAt;
  if(!sim.initialized||sim.environmentUpdatedAt!==contentUpdatedAt){
   const authored=new Set(manifest.objects.map(actor=>actor.objectId));for(const [id,actor]of Object.entries(sim.actors))if(!actor.spawned&&!authored.has(id))delete sim.actors[id];
   for(const actor of manifest.objects){if(sim.actors[actor.objectId]){sim.actors[actor.objectId].position=copy(actor.transform.position);sim.actors[actor.objectId].rotation=copy(actor.transform.rotation);}if(!sim.actors[actor.objectId])sim.actors[actor.objectId]={id:actor.objectId,modelId:actor.modelId,position:copy(actor.transform.position),rotation:copy(actor.transform.rotation),health:actor.gameplay.health,active:true,open:false,switched:false};}
   sim.initialized=true;sim.environmentUpdatedAt=contentUpdatedAt;
  }
  manifest.actors.push(...Object.values(sim.actors).filter(actor=>actor.definition).map(actor=>actor.definition));
  sim.streets=environment.streets||[];sim.mapRevision=environment.atlas?.revision||0;
  return {sim,manifest};
 }
 step(room,environment){
  const {sim,manifest}=this.initialize(room,environment),now=this.now(),dt=clamp((now-sim.time)/1000,0,.25);sim.time=now;
  const half=clamp(environment.builderScene?.mapSize||200,20,2000)/2;
  for(const player of Object.values(sim.players)){
   if(now-player.lastSeen>15000){for(const key of ['heldId','seatedId','vehicleId']){const actor=sim.actors[player[key]];if(actor?.holderId)actor.holderId=null;player[key]=null;}player.input={};}if(now-player.lastSeen>1000||player.health<=0)continue;
   const input=player.input||{},forward=clamp(input.forward,-1,1),side=clamp(input.side,-1,1),length=Math.max(1,Math.hypot(forward,side));
   let speed=player.vehicleId?12:input.sprint?6:4;
   if(player.seatedId) speed=0;
   const next={...player.position,x:clamp(player.position.x+(-Math.sin(player.yaw)*forward+Math.cos(player.yaw)*side)*speed*dt/length,-half,half),z:clamp(player.position.z+(-Math.cos(player.yaw)*forward-Math.sin(player.yaw)*side)*speed*dt/length,-half,half)};
   const floor=environment.builderScene||environment.proceduralLand?-100:Number(player.floor)||0;
   if(input.jump&&player.grounded){player.velocityY=6;player.grounded=false;}
   player.velocityY=(player.velocityY||0)-18*dt;next.y=Math.max(floor,next.y+player.velocityY*dt);player.grounded=next.y<=floor;if(player.grounded)player.velocityY=0;
   let blocked=false;
   for(const object of Object.values(room.objects)){
    if(object.deleted||object.open||buildingMaterial(object.materialId).solid===false)continue;
    const size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]),[x,y,z]=object.position;
    // Conservative world-space footprint for rotated pieces, resolved on server.
    const rotation=object.rotation[1],w=Math.abs(Math.cos(rotation))*size[0]+Math.abs(Math.sin(rotation))*size[2],d=Math.abs(Math.sin(rotation))*size[0]+Math.abs(Math.cos(rotation))*size[2];
    if(Math.abs(next.x-x)<w/2+.3&&Math.abs(next.z-z)<d/2+.3&&next.y<y+size[1]/2&&next.y+1.7>y-size[1]/2){
     if(player.position.y>=y+size[1]/2-.35){next.y=y+size[1]/2;player.velocityY=0;player.grounded=true;}else blocked=true;
    }
   }
   if(!blocked)player.position=this.collision.resolve(environment,player.position,next,sim.actors);
   const street=(environment.streets||[]).map(street=>{const dx=street.to.x-street.from.x,dz=street.to.z-street.from.z,t=Math.max(0,Math.min(1,((player.position.x-street.from.x)*dx+(player.position.z-street.from.z)*dz)/Math.max(.01,dx*dx+dz*dz)));return {street,distance:Math.hypot(player.position.x-street.from.x-dx*t,player.position.z-street.from.z-dz*t)};}).filter(hit=>hit.distance<=hit.street.width/2+2).sort((a,b)=>a.distance-b.distance)[0];player.locationName=street?.street.name||player.meetingName||environment.name;
   if(player.position.y>next.y){player.velocityY=0;player.grounded=true;}
   if(player.vehicleId){const vehicle=sim.actors[player.vehicleId];if(vehicle){vehicle.position={...player.position};vehicle.rotation.y=player.yaw;}}
   if(player.heldId){const held=sim.actors[player.heldId];if(held)held.position={x:player.position.x-Math.sin(player.yaw),y:player.position.y+1,z:player.position.z-Math.cos(player.yaw)};}
  }
  const active=Object.values(sim.players).filter(player=>now-player.lastSeen<1500&&player.health>0);
  for(const definition of manifest.actors){const actor=sim.actors[definition.objectId];if(!actor?.active||actor.health<=0||actor.holderId)continue;
   const kind=definition.gameplay.behavior;
   if(kind==='hostile'||kind==='patrol'){
    const target=active.slice().sort((a,b)=>distance(actor.position,a.position)-distance(actor.position,b.position))[0];
    const chase=kind==='hostile'&&target&&distance(actor.position,target.position)<clamp(definition.ai?.detectionRange||9,1,50);
    const goal=chase?target.position:{x:definition.position.x+Math.sin(now/1000)*3,y:definition.position.y,z:definition.position.z+Math.cos(now/1000)*3};
    const span=distance(actor.position,goal),step=Math.min(1,dt*clamp(definition.movement.speed||2,0,10)/Math.max(.001,span));actor.position.x+=(goal.x-actor.position.x)*step;actor.position.z+=(goal.z-actor.position.z)*step;
    if(chase&&span<1.5&&now-(actor.lastAttack||0)>1000){if(now>=(target.shieldUntil||0))target.health=Math.max(0,target.health-clamp(definition.gameplay.damage,0,50));actor.lastAttack=now;}
   }
   if(kind==='hazard')for(const target of active)if(distance(target.position,actor.position)<1.5&&now-(actor.lastAttack||0)>1000){if(now>=(target.shieldUntil||0))target.health=Math.max(0,target.health-clamp(definition.gameplay.damage,0,50));actor.lastAttack=now;}
  }
  sim.sequence++;return {sim,manifest};
 }
 view(room){const sim=room.simulation,now=this.now();return {authoritative:true,streets:sim.streets||[],mapRevision:sim.mapRevision||0,serverTime:now,sequence:sim.sequence,objects:room.objects,actors:sim.actors,players:Object.fromEntries(Object.entries(sim.players).filter(([,p])=>now-p.lastSeen<15000).map(([id,p])=>[id,{id,username:p.username,locationName:p.locationName,modelUrl:p.modelUrl,position:p.position,yaw:p.yaw,health:p.health,ammo:p.ammo??120,fuel:p.fuel??100,score:p.score,stats:{...p.stats,health:p.health},inventory:p.inventory,quests:p.quests,progress:p.progress||{},heldId:p.heldId,seatedId:p.seatedId,vehicleId:p.vehicleId,grounded:p.grounded}])),events:sim.events.slice(-30)};}
 snapshot(id,environment){return this.store.update(id,room=>{this.step(room,environment);return this.view(room);},{persist:false});}
 command(id,environment,identity,command){return this.store.update(id,async (room,allRooms)=>{
  const {sim,manifest}=this.step(room,environment),now=this.now(),actorId='account:'+identity.accountId;
  const requestId=String(command.requestId||'');if(!/^[\w-]{1,100}$/.test(requestId))fail('A command request ID is required.');
  sim.receipts ||= {};const receiptKey=actorId+':'+requestId;if(sim.receipts[receiptKey]){if(sim.receipts[receiptKey].action!==command.action)fail('Request ID already used.',409);return {...this.view(room),selfId:actorId,result:sim.receipts[receiptKey].result};}
  let player=sim.players[actorId],result={};
  if(command.action==='join'){
   const active=Object.entries(sim.players).filter(([id,p])=>id!==actorId&&now-p.lastSeen<15000);if(active.length>=(environment.publicDestination?128:this.capacity))fail('This multiplayer room is full.',409);
   const meeting=command.meetingId&&(environment.meetingPoints||[]).find(point=>point.id===command.meetingId);if(command.meetingId&&!meeting)fail('Shared meeting point not found.',404);const spawn=meeting?this.collision.meetingPosition(environment,meeting.position,sim.actors,room.objects):manifest.spawn?.position||environment.spawn||{x:0,y:0,z:2};
   if(!player)player=sim.players[actorId]={username:identity.username,position:{x:Number(spawn.x)||0,y:Number(spawn.y)||0,z:Number(spawn.z)||0},floor:Number(spawn.y)||0,yaw:0,velocityY:0,grounded:true,ammo:120,fuel:100,health:clamp(identity.stats?.health??100,0,100),stats:identity.stats||{},score:0,inventory:[],quests:{},cooldowns:{},lastSeen:now};
   for(const [otherId,otherRoom]of Object.entries(allRooms)){if(otherId===id)continue;const previous=otherRoom.simulation?.players[actorId];if(!previous)continue;previous.lastSeen=0;previous.replacedByRoom=id;previous.input={};for(const key of ['heldId','seatedId','vehicleId']){const held=otherRoom.simulation.actors[previous[key]];if(held)held.holderId=null;previous[key]=null;}}
   if(meeting){player.position={...spawn};player.floor=spawn.y;player.velocityY=0;player.grounded=true;}player.input={};player.username=identity.username;player.modelUrl=identity.avatar?.modelUrl||null;player.lastSeen=now;player.replacedByRoom=null;player.walletId=identity.walletId;player.meetingName=meeting?.name||environment.name;player.locationName=player.meetingName;result.message='Joined '+player.locationName;
  }else{
   if(player?.replacedByRoom)fail('This account joined another destination. Reload to rejoin this room.',409,'ROOM_SWITCHED');if(!player||now-player.lastSeen>15000)fail('Join this room before sending gameplay commands.',409);
   player.lastSeen=now;
   if(command.action==='input'){const input=command.input||{};player.input={forward:clamp(input.forward,-1,1),side:clamp(input.side,-1,1),jump:input.jump===true,sprint:input.sprint===true};player.yaw=clamp(input.yaw,-Math.PI*100,Math.PI*100);}
   else if(command.action==='respawn'){if(player.health>0)fail('Respawn is available after defeat.',409);player.position={...(manifest.spawn?.position||environment.spawn||{x:0,y:0,z:2})};player.health=100;player.ammo=120;player.fuel=100;player.input={};player.toolUses={};}
   else if(player.health<=0)fail('Respawn before acting.',409);
   else if(command.action==='drop'){const held=sim.actors[player.heldId];if(held){held.holderId=null;held.position={...player.position};player.heldId=null;}}
   else if(command.action==='interact'){
    if(player.vehicleId){sim.actors[player.vehicleId].holderId=null;player.vehicleId=null;}
    else if(player.seatedId){sim.actors[player.seatedId].holderId=null;player.seatedId=null;}
    else{
     const target=manifest.actors.filter(a=>sim.actors[a.objectId]?.active&&distance(sim.actors[a.objectId].position,player.position)<=Math.min(5,a.gameplay.interactionDistance)).sort((a,b)=>distance(sim.actors[a.objectId].position,player.position)-distance(sim.actors[b.objectId].position,player.position))[0];
     if(!target)fail('No usable item is within reach.',409);const entity=sim.actors[target.objectId],config=target.gameplay;
     if(entity.holderId&&entity.holderId!==actorId)fail('Another player is using this item.',409);
     if(now-(player.cooldowns[target.objectId]||0)<config.cooldown*1000)fail('Item is cooling down.',429);player.cooldowns[target.objectId]=now;
     if(config.behavior==='door')entity.open=!entity.open;
     else if(config.behavior==='switch')entity.switched=!entity.switched;
     else if(['pickup','hold'].includes(config.behavior)){if(player.heldId)fail('Drop the held item first.',409);player.heldId=entity.id;entity.holderId=actorId;if(!player.inventory.includes(target.modelId))player.inventory.push(target.modelId);}
     else if(config.behavior==='vehicle'){player.vehicleId=entity.id;entity.holderId=actorId;}
     else if(config.behavior==='seat'){player.seatedId=entity.id;entity.holderId=actorId;player.position={...entity.position};}
     else if(config.behavior==='heal')player.health=Math.min(100,player.health+clamp(config.value||25,0,100));
     else if(config.behavior==='hazard')entity.active=false;
     else if(config.behavior==='quest'){const quest=target.quest?.id||entity.id;player.quests[quest]=player.quests[quest]==='active'?'complete':'active';}
     result.message=target.dialogue?.text||config.prompt||'Item activated';
     if(config.action==='toggle')entity.switched=!entity.switched;if(config.action==='use')entity.lastUsedAt=now;
     if(config.action==='damage')player.health=Math.max(0,player.health-clamp(config.value,0,100));
     if(config.action==='score')player.score+=clamp(config.value,0,100);
     if(config.action==='teleport'){const portal=config.portal;if(!portal?.enabled)fail('Portal is locked.',409);if(portal.destinationType==='map')result.destination=portal.targetMapId;else{const destination=sim.actors[portal.targetObjectId];if(!destination)fail('Destination is unavailable.');player.position={...destination.position};}}
    }
   }
   else if(command.action==='spawn'){
    const asset=await this.resolveAsset(identity,command);if(!asset)fail('Purchase and publish this asset before deploying it.',403);
    if(Object.values(sim.actors).filter(actor=>actor.spawned).length>=250)fail('Room item limit reached.',409);
    if(asset.consumable&&asset.petId&&!Object.values(sim.actors).some(actor=>actor.asset?.id===asset.petId&&actor.active))fail('Deploy your pet in this room before feeding it.',409);if(asset.sku)await this.charge(identity,asset.sku,createHash('sha256').update(id+actorId+sim.sequence).digest('hex'));
    if(asset.consumable&&asset.petId){const pet=Object.values(sim.actors).find(actor=>actor.asset?.id===asset.petId&&actor.active);if(!pet)fail('Deploy your pet in this room before feeding it.',409);pet.boostUntil=now+10000;result.message=pet.asset.name+' received a treat.';}else{
    const entityId='spawn-'+requestId,position={x:player.position.x-Math.sin(player.yaw)*2,y:player.position.y,z:player.position.z-Math.cos(player.yaw)*2};
    const behavior=asset.behavior||(asset.assetType==='vehicles'?'vehicle':asset.assetType==='pets'?'patrol':'interact');
    const definition={objectId:entityId,modelId:asset.id,position:{...position},transform:{position:{...position},rotation:{x:0,y:player.yaw,z:0},scale:{x:1,y:1,z:1}},gameplay:{behavior,health:100,damage:0,interactionDistance:3,cooldown:1,action:'none'},movement:{speed:1},asset};
    sim.actors[entityId]={id:entityId,position,rotation:{y:player.yaw},active:true,health:100,spawned:true,ownerId:actorId,asset,definition};
    result.message=asset.name+' deployed to the shared room.';}
   }
   else if(command.action==='fire'){
    const tool=String(command.tool||'laser'),utility=UTILITY_TOOLS[tool],profile=RANGED_WEAPONS[tool],cooldown=utility?utility.cooldown*1000:profile?profile.interval*1000:tool==='dynamite'?1200:250;if(!utility&&!profile&&!['bat','taser','toxin','flamethrower','spray','jetpack'].includes(tool))fail('This tool has no server action.',422);
    player.toolReady ||= {};if(now<(player.toolReady[tool]||0))fail('Tool is cooling down.',429);if(utility?.charges&&(player.toolUses?.[tool]||0)>=utility.charges)fail('Utility depleted until respawn.',409);
    if(tool==='flamethrower'&&(player.fuel??100)<5)fail('Refill your igniter fuel.',409);if(profile&&(player.ammo??120)<=0)fail('Refill ammunition.',409);if(tool==='medkit'&&player.health>=100)fail('Health is already full.',409);
    if(['repair-tool','recycler'].includes(tool)&&!Object.values(room.objects).some(object=>!object.deleted&&object.ownerId===actorId&&(tool==='recycler'||object.hits>0)&&distance({x:object.position[0],y:object.position[1],z:object.position[2]},player.position)<8))fail('No eligible building piece is within reach.',409);
    const direction=command.direction;if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite))fail('Invalid aim direction.');const length=Math.hypot(...direction);if(length<.1)fail('Invalid aim direction.');const ray=direction.map(n=>n/length);
    await this.charge(identity,'tool:'+tool,createHash('sha256').update(id+actorId+sim.sequence).digest('hex'));if(tool==='flamethrower')player.fuel=(player.fuel??100)-5;if(profile)player.ammo=(player.ammo??120)-1;player.lastShot=now;player.toolReady[tool]=now+cooldown;player.toolUses ||= {};player.toolUses[tool]=(player.toolUses[tool]||0)+1;
    const origin={...player.position,y:player.position.y+1.5},targets=[];
    for(const entity of Object.values(sim.actors)){if(!entity.active||entity.health<=0)continue;const offset=[entity.position.x-origin.x,entity.position.y+1-origin.y,entity.position.z-origin.z],along=offset.reduce((sum,n,i)=>sum+n*ray[i],0),perpendicular=Math.sqrt(Math.max(0,offset.reduce((sum,n)=>sum+n*n,0)-along*along));if(along>0&&along<(tool==='bat'?3:40)&&perpendicular<1)targets.push({entity,along});}
    const blocks=[];for(const object of Object.values(room.objects)){if(object.deleted||object.open)continue;const offset=object.position.map((n,i)=>n-[origin.x,origin.y,origin.z][i]),along=offset.reduce((sum,n,i)=>sum+n*ray[i],0),perpendicular=Math.sqrt(Math.max(0,offset.reduce((sum,n)=>sum+n*n,0)-along*along)),size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);if(along>0&&along<40&&perpendicular<Math.max(...size)/2)blocks.push({object,along});}
    const blocker=blocks.sort((a,b)=>a.along-b.along)[0];let hit=targets.sort((a,b)=>a.along-b.along)[0];if(blocker&&(!hit||blocker.along<hit.along)){hit=null;const object=blocker.object;if(tool==='spray')object.paint=object.paint.map(()=>clamp(command.color,0,0xffffff));else if(!utility){object.hits=(object.hits||0)+1;if(object.hits>=5)object.deleted=true;}object.revision=++room.revision;}
if(utility){if(tool==='medkit')player.health=Math.min(100,player.health+30);else if(tool==='shield-kit')player.shieldUntil=now+6000;else if(tool==='scanner')result.message='Scanner: '+targets.length+' targets in your aim path';else if(tool==='recycler'||tool==='repair-tool'){const candidates=Object.values(room.objects).filter(object=>!object.deleted&&object.ownerId===actorId&&distance({x:object.position[0],y:object.position[1],z:object.position[2]},player.position)<8).sort((a,b)=>distance({x:a.position[0],y:a.position[1],z:a.position[2]},player.position)-distance({x:b.position[0],y:b.position[1],z:b.position[2]},player.position));const target=candidates[0];if(target){if(tool==='recycler')target.deleted=true;target.hits=0;target.revision=++room.revision;}}else if(tool==='beacon')result.message='Waypoint beacon shared in room events';else if(tool==='supply-kit'){player.fuel=100;player.ammo=Math.min(120,(player.ammo??120)+12);}}
    else if(tool==='jetpack'){player.velocityY=8;player.grounded=false;}
    else if(tool==='spray'){if(hit)hit.entity.paint=clamp(command.color,0,0xffffff);}
    else if(hit){hit.entity.health=Math.max(0,hit.entity.health-(profile?.damage||damageByTool[tool]||20));if(hit.entity.health===0){hit.entity.active=false;player.score+=10;await this.reward(identity,'defeat',requestId+'-defeat');player.progress ||= {};player.progress.defeat=(player.progress.defeat||0)+1;}}
    player.progress ||= {};if(hit){const event=tool==='taser'?'taser-hit':tool==='dynamite'?'blast-hit':tool==='spray'?'spray':'laser-hit';await this.reward(identity,event,requestId+'-hit');player.progress[event]=(player.progress[event]||0)+1;}
    result={...result,tool,origin,direction:ray,hitId:hit?.entity.id||null};
   }else fail('This action has no server handler. It was not run locally.',422);
  }
  if(now-(player.lastTelemetry||0)>5000){await this.telemetry(identity.walletId,{health:player.health,world:id});player.lastTelemetry=now;}
  if(command.action!=='input'){sim.events.push({id:requestId,actorId,action:command.action,...result,at:now});sim.events=sim.events.slice(-100);}
  sim.receipts[receiptKey]={action:command.action,result};const keys=Object.keys(sim.receipts);if(keys.length>500)for(const key of keys.slice(0,keys.length-500))delete sim.receipts[key];
  return {...this.view(room),selfId:actorId,result};
 },{persist:command.action!=='input'});}
 async player(id,actorId){return (await this.store.get(id)).simulation?.players[actorId];}
 async care(actorId,receipt){const rooms=await this.store.read();for(const [id,room] of Object.entries(rooms)){if(!room.simulation?.players[actorId])continue;await this.store.update(id,current=>{const player=current.simulation.players[actorId];player.careReceipts ||= [];if(player.careReceipts.includes(receipt.id))return;const effect=receipt.effect;player.stats ||= {};if(effect?.stat==='all')for(const key of Object.keys(player.stats))player.stats[key]=key==='toxicity'?0:100;else if(effect?.stat&&effect.stat!=='health')player.stats[effect.stat]=Math.max(0,Math.min(100,(player.stats[effect.stat]||0)+Number(effect.amount||0)));if(effect?.stat==='health'||effect?.stat==='all')player.health=effect.stat==='all'?100:Math.min(100,player.health+Number(effect.amount||0));player.careReceipts.push(receipt.id);player.careReceipts=player.careReceipts.slice(-100);});}}
}
