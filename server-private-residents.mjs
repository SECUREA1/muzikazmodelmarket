import {ServerBuilderCollision} from './server-builder-collision.mjs';
import {stepWorldResidents,residentCommand} from './server-world-residents.mjs';
import {residentLifeView} from './server-resident-life.mjs';
import {casinoLifeView} from './server-casino-residents.mjs';
import {residentProgressView} from './server-resident-dialogue.mjs';
import {randomUUID} from 'node:crypto';

const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const finitePosition=value=>value&&['x','y','z'].every(key=>Number.isFinite(value[key])&&Math.abs(value[key])<=100000);

// A solo visitor's local pose is used only by this isolated social simulation.
// These rooms never join public presence, store objects, or call reward/wallet
// services. Accounts cannot select another account's simulation with a room ID.
export class PrivateResidentRooms {
 constructor({now=Date.now,collision=new ServerBuilderCollision(),capacity=128,idleMs=60000}={}){
  Object.assign(this,{now,collision,capacity:Math.max(1,Math.min(128,Math.floor(capacity)||128)),idleMs});this.rooms=new Map();
 }
 prune(){
  const now=this.now();
  for(const [key,room]of this.rooms)if(now-room.lastSeen>this.idleMs)this.rooms.delete(key);
  while(this.rooms.size>=this.capacity)this.rooms.delete(this.rooms.keys().next().value);
 }
 step(room){
  const now=this.now(),sim=room.sim,dt=Math.max(0,Math.min(.25,(now-sim.time)/1000));sim.time=now;
  this.collision.withActorCandidates(sim.actors,()=>stepWorldResidents(sim,room.environment,now,dt,{collision:this.collision,objects:{}}));
  sim.sequence++;
 }
 command(environment,identity,command={}){
  if(!identity?.accountId)fail('A game session is required.',401);
  if(!['join','input','npc-social','leave'].includes(command.action))fail('Choose a solo conversation action.');
  if(command.action!=='leave'&&!finitePosition(command.position))fail('Send a valid local player position.');
  const key=JSON.stringify([identity.accountId,environment.id]),selfId='solo:'+identity.accountId,now=this.now();
  if(command.action==='leave'){if(!command.sessionId||this.rooms.get(key)?.sessionId===command.sessionId)this.rooms.delete(key);return {private:true,closed:true};}
  let room=this.rooms.get(key);
  if(room&&now-room.lastSeen>this.idleMs){this.rooms.delete(key);room=null;}
  if(!room){
   this.prune();
   const player={id:selfId,actorId:selfId,username:identity.username||'Explorer',health:100,lastSeen:now,position:{...command.position},movementRevision:0,score:0};
   room={sessionId:randomUUID(),environment,lastSeen:now,sim:{time:now,sequence:0,actors:{},players:{[selfId]:player},events:[],transportRadio:[]}};this.rooms.set(key,room);
  }
  // Refresh an edited map's collision/context without exposing a public room.
  room.environment=environment;room.lastSeen=now;
  const player=room.sim.players[selfId];player.position={...command.position};player.lastSeen=now;player.yaw=Number.isFinite(command.yaw)?command.yaw:0;
  this.step(room);
  let result;
  if(command.action==='npc-social'){
   const message=residentCommand(room.sim,player,environment,command,now,{collision:this.collision,objects:{}});
   result={message,residentId:command.entityId};
  }
  const sim=room.sim;
  const radioCall=call=>({...call,id:room.sessionId+':'+call.id}),conversation=player.npcConversation;
  const playerView={...player,residentProgress:residentProgressView(player),...(conversation?{npcConversation:{...conversation,conversation:(conversation.conversation||[]).map(radioCall)}}:{})};
  return structuredClone({private:true,authoritative:false,sessionId:room.sessionId,selfId,serverTime:now,sequence:sim.sequence,actors:sim.actors,players:{[selfId]:playerView},residentLife:residentLifeView(sim),casinoLife:casinoLifeView(sim),transportRadio:sim.transportRadio.map(radioCall),objects:{},events:[],...(result?{result}:{})});
 }
 tickActive(){
  const now=this.now();
  for(const [key,room]of this.rooms){
   if(now-room.lastSeen>this.idleMs){this.rooms.delete(key);continue;}
   if(now-room.lastSeen<15000)this.step(room);
  }
 }
}
