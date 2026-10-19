import {createHockey,joinHockey,leaveHockey,hockeyInput,nextHockeyGame,restartHockey,stepHockey,changeHockeyLine,toggleHockeyGoalie,switchHockeyPlayer,requestHockeyTimeout} from './public/js/hockey-rules.js';
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const INPUT_ACTIONS=['shoot','pass','check','poke','hook','slash','hold','lift'];
const lobbySettings=(raw={})=>{const settings=raw&&typeof raw==='object'?raw:{};return Object.fromEntries(['difficulty','mode','periodSeconds','aiFill'].filter(key=>settings[key]!==undefined).map(key=>[key,settings[key]]));};
/** One authoritative simulation per arena. Routes supply authenticated identities. */
export class HockeyRooms {
 constructor({now=Date.now}={}){this.now=now;this.rooms=new Map();}
 tick(){
  const now=this.now();for(const [id,room]of this.rooms){
   for(const [actor,seen]of room.seen)if(now-seen>15000){leaveHockey(room.state,actor);room.seen.delete(actor);}
   if(!room.seen.size){this.rooms.delete(id);continue;}
   let remaining=Math.min(.5,Math.max(0,(now-room.at)/1000));const stepped=room.started&&remaining>1e-6;while(remaining>1e-6){const dt=Math.min(.05,remaining);if(room.started)stepHockey(room.state,dt);remaining-=dt;}if(stepped)for(const player of room.state.players)for(const key of INPUT_ACTIONS)player.input[key]=false;room.at=now;room.sequence++;
  }
 }
 command(id,environment,identity,command={}){
  const actor='account:'+identity.accountId;let room=this.rooms.get(id);
  if(!room){if(!['join','spectate'].includes(command.action))fail('Join the hockey match first.');room={state:createHockey({...environment.builderScene?.gameplay?.hockey||environment.hockey,...(command.action==='join'?lobbySettings(command.settings):{})}),at:this.now(),seen:new Map(),sequence:0,started:false};this.rooms.set(id,room);}
  const s=room.state;
  if(command.action==='join'){
   // The first player chooses settings, even when spectators opened the room.
   // Later joins reserve a skater without rebuilding the existing roster.
   if(!room.started&&!s.host&&!s.players.some(p=>p.human)&&command.settings){const spectators=s.spectators;Object.assign(s,createHockey({...s.config,...lobbySettings(command.settings)}));s.spectators=spectators;}
   joinHockey(s,actor,identity.username,command.slot||null);s.spectators=s.spectators.filter(p=>p.id!==actor);room.seen.set(actor,this.now());
  }else if(command.action==='spectate'){
   if(!s.spectators.some(p=>p.id===actor)&&s.spectators.length>=64)throw Object.assign(Error('All spectator places are occupied.'),{statusCode:409});
   leaveHockey(s,actor);s.spectators.push({id:actor,name:String(identity.username||'Spectator').slice(0,32)});room.seen.set(actor,this.now());
  }else{
   if(!room.seen.has(actor))throw Object.assign(Error('Join the hockey match first.'),{statusCode:409});
   const spectator=s.spectators.some(p=>p.id===actor);
   if(command.action==='leave'){leaveHockey(s,actor);room.seen.delete(actor);}
   else if(command.action==='watch')room.seen.set(actor,this.now());
   else{
    if(spectator)throw Object.assign(Error('Spectators cannot control players or match results.'),{statusCode:403});
    if(command.action==='start'){
     if(s.host!==actor)fail('Only the host can start the hockey match.',403);
     if(room.started)fail('This hockey match has already started.');
     // Begin always produces two playable teams, even when the host is the
     // only human or the lobby was configured without automatic AI fill.
     s.config.aiFill=true;
     // Lobby input must never become a queued shot or check on opening faceoff.
     for(const player of s.players){player.input={};player.vx=player.vz=0;}
     room.started=true;room.at=this.now();
    }
    else if(command.action==='input'){
     const pending=s.players.find(player=>player.human===actor)?.input;
     hockeyInput(s,actor,command.input);
     // A quick release can arrive before the next simulation tick. Preserve
     // actions until a tick consumes them while movement keeps the newest axes.
     if(room.started&&pending){const current=s.players.find(player=>player.human===actor).input;for(const key of INPUT_ACTIONS)current[key] ||= pending[key];}
    }
    else if(command.action==='next'||command.action==='rematch'){
     if(s.host!==actor)fail('Only the host can start another hockey match.',403);
     if(!room.started||s.phase!=='finished')fail('Finish this hockey match before starting another.');
     if(!(command.action==='next'?nextHockeyGame(s,actor):restartHockey(s,actor)))fail('The next hockey match is not available.');
     room.at=this.now();
    }
    else if(!room.started)fail('Wait for the host to start the hockey match.');
    else if(command.action==='line')changeHockeyLine(s,actor);
    else if(command.action==='goalie')toggleHockeyGoalie(s,actor);
    else if(command.action==='timeout')requestHockeyTimeout(s,actor);
    else if(command.action==='switch')switchHockeyPlayer(s,actor);
    else throw Object.assign(Error('Unknown hockey action.'),{statusCode:400});
    room.seen.set(actor,this.now());
   }
  }
  room.sequence++;return {selfId:actor,role:!room.seen.has(actor)?'left':s.spectators.some(p=>p.id===actor)?'spectator':'player',host:s.host,started:room.started,sequence:room.sequence,serverTime:this.now(),state:structuredClone(s)};
 }
}
