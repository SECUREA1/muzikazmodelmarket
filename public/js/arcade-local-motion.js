import {WalkingMotion} from './walking-motion.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const ownSlot=room=>room?.slots?.findIndex(slot=>slot.actor===room.selfId)??-1;

// Only the controlled player's presentation is predicted. Match physics,
// possession, scores, clocks and all other players remain server snapshots.
export class LocalArcadeMotion {
 constructor(){this.motion=new WalkingMotion({immediate:true,staleAfter:Infinity,staleFade:0,recoverAfter:1200});this.reset();}
 reset(){this.motion.reset();this.identity=null;this.stoppage=0;this.receivedAt=0;}
 reconcile(room,{sentAt,receivedAt=performance.now()}={}){
  const slot=ownSlot(room),state=room?.state,player=state?.basketball?.players?.[slot];
  const identity=room?.role==='player'?String(room.inputEpoch||'')+':'+state?.game+':'+slot:null;
  const inbound=player&&state.basketball.stoppage>0&&this.stoppage<=0;
  if(identity!==this.identity||inbound){this.motion.reset();this.identity=identity;}
  this.stoppage=state?.basketball?.stoppage||0;this.receivedAt=receivedAt;
  if(identity&&player)this.motion.reconcile({x:player.x*.01,z:player.y*.01},{serverTime:room.serverTime,simulationTime:room.simulationTime??room.serverTime,sentAt,receivedAt});
 }
 sample(room,input={},delta=0,now=performance.now()){
  const state=room?.state;if(!state)return state;
  const slot=ownSlot(room),active=room.role==='player'&&slot>=0&&room.started&&!state.ended;
  if(state.basketball){
   const full=state.basketball,player=full.players[slot];if(!active||!player)return {...state,basketball:{...full,selfSlot:slot}};
   if(!this.motion.position)this.reconcile(room,{receivedAt:now});
   const duration=clamp(delta,0,.25),steps=Math.max(1,Math.ceil(duration/.05)),step=duration/steps,candidate={};
   const waiting=full.stoppage>0&&now-this.receivedAt<full.stoppage*1000;
   const controls=waiting?{}:{side:clamp(input.moveX,-1,1),forward:-clamp(input.moveY,-1,1)};
   for(let index=0;index<steps;index++)this.motion.sample(now-(steps-index-1)*step*1000,step,controls,1.4,candidate);
   const x=clamp(candidate.x*100,115,685),y=clamp(candidate.z*100,72,388);this.motion.constrain({x:x*.01,z:y*.01});
   const players=full.players.map((other,index)=>index===slot?{...other,x,y,vx:this.motion.velocity.x*100,vy:this.motion.velocity.z*100}:other);
   return {...state,basketball:{...full,players,selfSlot:slot}};
  }
  if(!active)return state;
  if(state.game===3){
   const x=clamp(input.x??400,115,685),y=clamp(input.y??370,250,400);
   return slot===0?{...state,pointer:{x,y}}:{...state,opponent:{x,y:clamp(460-y,60,210)}};
  }
  return {...state,pointer:{x:clamp(input.x??400,20,780),y:clamp(input.y??370,20,440)}};
 }
}

// A delayed poll cannot hold a press or release. Additional movement updates
// replace one latest state while three requests are already in flight.
export function createArcadeInputStream({send,onState=()=>{},onError=()=>{},readInput,ready=()=>true,now=()=>performance.now()}){
 let generation=0,pending=null,lastKey=null,lastPoll=-Infinity;const flights=new Set();
 function flush(){
  if(!ready()||!pending||flights.size>=3)return;
  const queued=pending;pending=null;if(queued.generation!==generation)return;
  const token={generation};flights.add(token);
  let request;try{request=send(queued.input);}catch(error){request=Promise.reject(error);}
  void Promise.resolve(request).then(state=>{if(token.generation===generation)onState(state);}).catch(error=>{if(token.generation===generation)onError(error);}).finally(()=>{flights.delete(token);flush();});
 }
 function queue(force=false){
  if(!ready())return;const input={...readInput()},key=JSON.stringify(input);if(!force&&key===lastKey)return;lastKey=key;pending={input,generation};flush();
 }
 return {request(){queue();},poll(time=now()){if(time-lastPoll<50||flights.size)return;lastPoll=time;queue(true);},reset(){generation++;pending=null;lastKey=null;lastPoll=-Infinity;}};
}
