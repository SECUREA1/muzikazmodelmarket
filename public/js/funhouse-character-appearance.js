import {isFunhouseEnvironment} from './clown-funhouse-config.js';

export const FUNHOUSE_CLOWN_AVATARS=Object.freeze([
 'funhouse-ringmaster-avatar','funhouse-juggler-avatar','funhouse-greeter-avatar',
 'funhouse-driver-avatar','funhouse-scare-clown-avatar'
]);

/** A map costume changes presentation, never account selection or ownership. */
export function funhouseCharacterAppearance(environment,peer){
 if(!peer||!isFunhouseEnvironment(environment))return peer;
 let hash=2166136261;
 for(const character of String(peer.id||peer.actorId||peer.username||'funhouse-guest'))hash=Math.imul(hash^character.charCodeAt(0),16777619);
 const selected=peer.avatarBuildAssetId;
 const avatarBuildAssetId=FUNHOUSE_CLOWN_AVATARS.includes(selected)?selected:FUNHOUSE_CLOWN_AVATARS[(hash>>>0)%FUNHOUSE_CLOWN_AVATARS.length];
 return {...peer,avatarBuildAssetId,modelUrl:null,funhouseClownAppearance:true};
}
