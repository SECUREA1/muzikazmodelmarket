/** Portable equipment profiles are tied to canonical native model identities.
 * Builder damage/range fields and client-supplied statistics are never read. */
export const FORGE_EQUIPMENT=Object.freeze({
 'forge-damascus-blade':Object.freeze({kind:'melee',label:'Stormfold Damascus Blade',damage:38,range:3,cooldownMs:550}),
 'forge-battle-axe':Object.freeze({kind:'melee',label:'Ironwake Battle Axe',damage:46,range:2.8,cooldownMs:750}),
 'forge-warhammer':Object.freeze({kind:'melee',label:'Emberstrike Warhammer',damage:55,range:2.5,cooldownMs:950}),
 'forge-aegis-shield':Object.freeze({kind:'shield',label:'Aegis Forged Shield',guardMs:900,cooldownMs:1500})
});
export function forgeEquipmentForActor(actor){
 if(!actor||actor.active===false||actor.health!==undefined&&actor.health<=0)return null;
 const buildAssetId=actor.asset?.buildAssetId||actor.modelId,profile=FORGE_EQUIPMENT[buildAssetId];
 return profile?{...profile,actorId:actor.id,buildAssetId}:null;
}
export function heldForgeEquipment(actors,player){
 const actor=actors?.[player?.heldId];
 if(!actor||actor.holderId!==player.actorId||actor.active===false||actor.health!==undefined&&actor.health<=0)return null;
 return forgeEquipmentForActor(actor);
}
/** Guarding is an explicit action with a short window and a recovery gap.
 * Releasing the held shield immediately invalidates the guard. */
export function activateForgeGuard(actors,player,now){
 const equipment=heldForgeEquipment(actors,player);
 if(!equipment||equipment.kind!=='shield')throw Object.assign(Error('Hold an Aegis Forged Shield before guarding.'),{statusCode:409});
 if(!Number.isFinite(now))throw Object.assign(Error('The server guard clock is unavailable.'),{statusCode:422});
 if(player.health<=0||player.vehicleId||player.seatedId||player.replacedByRoom)throw Object.assign(Error('Stand with your shield ready before guarding.'),{statusCode:409});
 player.toolReady ||= {};
 if(now<(player.toolReady['forge-shield']||0))throw Object.assign(Error('Let your shield recover before guarding again.'),{statusCode:429});
 player.forgeGuard={heldId:equipment.actorId,until:now+equipment.guardMs};player.toolReady['forge-shield']=now+equipment.cooldownMs;
 return {tool:'forge-equipment',equipmentId:equipment.buildAssetId,guardUntil:player.forgeGuard.until,readyAt:player.toolReady['forge-shield'],cooldownMs:equipment.cooldownMs,message:'Aegis guard raised. Keep holding the shield to block incoming hits.'};
}
export const forgeGuardActive=(player,now)=>Boolean(player?.heldId&&player.forgeGuard?.heldId===player.heldId&&now<player.forgeGuard.until);
