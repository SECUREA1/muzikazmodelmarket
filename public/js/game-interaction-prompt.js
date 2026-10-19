import {isBasketball,basketballJerseyTeam} from './basketball.js';
import {basketballSpectatorRestricted} from './basketball-rules.js';

const finitePoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const distance=(from,to)=>Math.hypot(from.x-to.x,from.y-to.y,from.z-to.z);
const list=value=>Array.isArray(value)?value:Object.values(value||{});
const labelFor=(actor,config)=>config.prompt||({door:actor.open?'Close door':'Open door',switch:actor.switched?'Switch off':'Switch on',seat:'Sit down',vehicle:'Enter vehicle',pickup:'Pick up item',hold:'Hold item',heal:'Use health',talk:'Talk',quest:'View quest',hazard:'Disarm',trigger:'Activate'})[config.behavior]||'Use / interact';

/**
 * Predict the small contextual button from an authoritative room snapshot.
 * player is snapshot.players[selfId]; actors is snapshot.actors (record or array).
 * Authored actorDefinitions can be a function(id), Map, record, or manifest array;
 * spawned/managed actors carry their own definition.gameplay in the snapshot.
 * Pass snapshot.basketball and snapshot.match (or matchState) for sports and
 * finished-state gates. Exit prompts omit entityId because the backend exits
 * the current seat/vehicle before selecting any target.
 * The result is only a prompt: send its entityId with interact (or drop for kind
 * 'drop') and let the server validate the action again. Server cooldowns and
 * visibility are not exposed here and are deliberately not inferred. key is
 * the lowercase authored interactionKey, for local-runtime activation. Inert
 * interact/trigger actors can be included explicitly with hideInert:false.
 */
export function resolveServerInteraction({player,actors={},actorDefinitions=null,basketball=null,match=null,matchState=null,selfId=player?.actorId||player?.id,hideInert=true}={}){
 if(!player||!finitePoint(player.position)||player.health<=0||(match?.state||matchState)==='finished'||player.replacedByRoom)return null;
 const entities=list(actors),byId=new Map(entities.filter(Boolean).map(actor=>[String(actor.id||actor.objectId),actor]));
 const definition=id=>typeof actorDefinitions==='function'?actorDefinitions(id):actorDefinitions instanceof Map?actorDefinitions.get(id):Array.isArray(actorDefinitions)?actorDefinitions.find(actor=>String(actor.objectId||actor.id)===id):actorDefinitions?.[id];
 const contextual=(kind,entityId,title,key,vehicleActive=false)=>({kind,...(kind==='drop'?{entityId}:{}),key:key.toLowerCase(),prompt:`${key.toUpperCase()} — ${title}`,label:title,title,hint:`Tap or press ${key.toUpperCase()}`,vehicleActive});
 if(player.vehicleId)return byId.has(String(player.vehicleId))?contextual('vehicle',player.vehicleId,'Exit vehicle','F',true):null;
 if(player.seatedId)return byId.has(String(player.seatedId))?contextual('item',player.seatedId,'Stand up','E'):null;
 if(player.heldId){
  const held=byId.get(String(player.heldId));
  return held&&!(basketball&&isBasketball(held))?contextual('drop',player.heldId,'Drop held item','G'):null;
 }
 let nearest=null;
 for(const actor of entities){
  if(!actor||!actor.active||actor.loot||!finitePoint(actor.position))continue;
  const id=String(actor.id||actor.objectId||'');if(!id)continue;
  const authored=definition(id),config={...authored?.gameplay,...actor.definition?.gameplay,...actor.gameplay};
  if(!config.behavior||(['hostile','patrol','decor'].includes(config.behavior)&&(!config.action||config.action==='none')))continue;
  if(hideInert&&['interact','trigger'].includes(config.behavior)&&(!config.action||config.action==='none')&&!authored?.dialogue?.text&&!actor.definition?.dialogue?.text)continue;
  if(actor.holderId&&actor.holderId!==selfId)continue;
  const range=Math.min(5,config.interactionDistance),span=distance(player.position,actor.position);
  if(!Number.isFinite(range)||span>range)continue;
  // The sports action row owns catching; a generic pickup bypasses its reach,
  // swept-pass and line-of-sight checks and is unavailable to spectators.
  if(basketball&&(actor.basketballMatchBall||isBasketball(actor)))continue;
  if(basketball?.state==='live'){
   if(player.basketballRole==='spectator'&&(config.behavior==='vehicle'||config.behavior==='seat'&&basketballSpectatorRestricted(actor.position,{basketball})))continue;
   const jersey=basketballJerseyTeam(actor)||basketballJerseyTeam(authored);
   if(jersey&&(player.basketballRole==='spectator'||player.basketballTeam&&player.basketballTeam!==jersey))continue;
  }
  if(config.action==='teleport'){
   const portal=config.portal;
   if(!portal?.enabled)continue;
   if(portal.destinationType==='map'){if(!portal.targetMapId)continue;}
   else if(!byId.has(String(portal.targetObjectId)))continue;
  }
  if(!nearest||span<nearest.distance)nearest={actor,config,id,distance:span};
 }
 if(!nearest)return null;
 const {actor,config,id}=nearest,title=labelFor(actor,config),vehicle=config.behavior==='vehicle',key=String(config.interactionKey||(vehicle?'f':'e')).toLowerCase();
 return {kind:vehicle?'vehicle':'item',entityId:id,key,prompt:`${key.toUpperCase()} — ${title}`,label:title,title,hint:config.action==='teleport'?'Tap to travel':vehicle?'Tap to drive':`Tap or press ${key.toUpperCase()}`,vehicleActive:false};
}
