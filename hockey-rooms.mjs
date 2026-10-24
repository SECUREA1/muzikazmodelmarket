import {randomUUID} from 'node:crypto';
import {createHockey,joinHockey,leaveHockey,hockeyInput,nextHockeyGame,restartHockey,stepHockey,changeHockeyLine,toggleHockeyGoalie,switchHockeyPlayer,requestHockeyTimeout,relocateHockeyPlayer} from './public/js/hockey-rules.js';
/** One authoritative simulation per arena. Routes supply authenticated identities. */
export class HockeyRooms {
 constructor({now=Date.now}={}){this.now=now;this.rooms=new Map();}
 tick(){
  const now=this.now();for(const [id,room]of this.rooms){
   for(const [actor,seen]of room.seen)if(now-seen>15000){leaveHockey(room.state,actor);room.seen.delete(actor);room.inputClients?.delete(actor);}
   if(!room.seen.size){this.rooms.delete(id);continue;}
   let remaining=Math.min(.5,Math.max(0,(now-room.at)/1000));while(remaining>1e-6){const dt=Math.min(.05,remaining);if(room.started)stepHockey(room.state,dt);remaining-=dt;}room.at=now;room.sequence++;
  }
 }
 command(id,environment,identity,command={}){
  const actor='account:'+identity.accountId;let room=this.rooms.get(id);
  if(!room){if(!['join','spectate'].includes(command.action))throw Object.assign(Error('Join the hockey match first.'),{statusCode:409});room={state:createHockey({...environment.builderScene?.gameplay?.hockey||environment.hockey,...(command.action==='join'&&command.settings?{difficulty:command.settings.difficulty,mode:command.settings.mode,periodSeconds:command.settings.periodSeconds,aiFill:command.settings.aiFill}:{})}),at:this.now(),seen:new Map(),sequence:0,started:false};this.rooms.set(id,room);}
  const s=room.state;room.inputClients ||=new Map();
  if(command.action==='join'){
   if(!room.started&&command.settings){const spectators=s.spectators;Object.assign(s,createHockey({...s.config,...command.settings}));s.spectators=spectators;}
   joinHockey(s,actor,identity.username,command.slot||null);hockeyInput(s,actor,{});room.inputClients.set(actor,{epoch:randomUUID(),sequence:-1});room.started=true;s.spectators=s.spectators.filter(p=>p.id!==actor);room.seen.set(actor,this.now());
  }else if(command.action==='spectate'){
   if(!s.spectators.some(p=>p.id===actor)&&s.spectators.length>=64)throw Object.assign(Error('All spectator places are occupied.'),{statusCode:409});
   leaveHockey(s,actor);s.spectators.push({id:actor,name:String(identity.username||'Spectator').slice(0,32)});room.seen.set(actor,this.now());
  }else{
   if(!room.seen.has(actor))throw Object.assign(Error('Join the hockey match first.'),{statusCode:409});
   const spectator=s.spectators.some(p=>p.id===actor);
   if(command.action==='leave'){leaveHockey(s,actor);room.seen.delete(actor);room.inputClients.delete(actor);}
   else if(command.action==='watch'&&spectator)room.seen.set(actor,this.now());
   else{
    if(spectator)throw Object.assign(Error('Spectators cannot control players or match results.'),{statusCode:403});
    if(command.action==='input'){const inputState=room.inputClients.get(actor);if(command.inputSequence!==undefined&&(!Number.isSafeInteger(command.inputSequence)||command.inputSequence<0))throw Object.assign(Error('Invalid input sequence.'),{statusCode:422});if((command.inputEpoch===undefined||command.inputEpoch===inputState?.epoch)&&(command.inputSequence===undefined||command.inputSequence>(inputState?.sequence??-1))){hockeyInput(s,actor,command.input);if(inputState&&command.inputSequence!==undefined)inputState.sequence=command.inputSequence;}}
    else if(command.action==='teleport-floor'){relocateHockeyPlayer(s,actor,command.position);room.inputClients.set(actor,{epoch:randomUUID(),sequence:-1});}
    else if(command.action==='next')nextHockeyGame(s,actor);
    else if(command.action==='rematch')restartHockey(s,actor);
    else if(command.action==='line')changeHockeyLine(s,actor);
    else if(command.action==='goalie')toggleHockeyGoalie(s,actor);
    else if(command.action==='timeout')requestHockeyTimeout(s,actor);
    else if(command.action==='switch')switchHockeyPlayer(s,actor);
    else throw Object.assign(Error('Unknown hockey action.'),{statusCode:400});
    room.seen.set(actor,this.now());
   }
  }
  room.sequence++;return {selfId:actor,role:s.spectators.some(p=>p.id===actor)?'spectator':'player',sequence:room.sequence,serverTime:this.now(),inputEpoch:room.inputClients.get(actor)?.epoch||null,state:structuredClone(s)};
 }
}
