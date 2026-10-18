import {createArcadeMatch} from './public/js/arcade-match.js';
import {arcadeSettings} from './public/js/arcade-rules.js';
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const IDS=['hockey','shooting','basketball','air-hockey','billiards'];
/** Server owns scores, physics, clock and occupancy. One round per map. */
export class ArcadeRooms {
 constructor({now=Date.now}={}){this.now=now;this.rooms=new Map();}
 leave(actor){for(const room of this.rooms.values()){room.members.delete(actor);for(const slot of room.slots)if(slot.actor===actor){slot.actor=null;slot.name='AI';}if(room.host===actor)room.host=room.slots.find(s=>s.actor)?.actor||null;}}
 tick(){const now=this.now();for(const [id,r] of this.rooms){for(const [actor,m] of r.members)if(now-m.at>15000){r.members.delete(actor);for(const slot of r.slots)if(slot.actor===actor){slot.actor=null;slot.name='AI';}}
 if(!r.members.size){this.rooms.delete(id);continue;}if(!r.slots.some(s=>s.actor===r.host))r.host=r.slots.find(s=>s.actor)?.actor||null;
 const dt=Math.min(.5,Math.max(0,(now-r.at)/1000));r.at=now;
 if(r.game===3&&!r.slots[1].actor)r.match.opponent(null);
 if(r.started){const slot=r.slots[r.turn];if(!slot.actor){r.ai+=dt;r.match.input({x:400+Math.sin(now/650)*180,y:180});if(r.ai>1.2){r.match.action();r.ai=0;if(r.game!==3)r.turn=1-r.turn;}}r.match.step(dt);}r.sequence++;}}
 command(id,environment,identity,c={}){const actor='account:'+identity.accountId;let r=this.rooms.get(id);const game=Number(c.game);
 if(!r){if(!['join','spectate'].includes(c.action))fail('Join or spectate first.');const config=arcadeSettings(environment.builderScene?.gameplay?.arcade||environment.arcade);if(!Number.isInteger(game)||game<0||game>4||!config.enabled.includes(IDS[game]))fail('Choose an available game.',400);r={game,config,match:createArcadeMatch(game,config),members:new Map(),slots:[{actor:null,name:'AI'},{actor:null,name:'AI'}],host:null,turn:0,started:false,ai:0,sequence:0,at:this.now()};this.rooms.set(id,r);}
 if(['join','spectate'].includes(c.action)){
 if(game!==r.game)fail('Another game is active in this park. Leave it before choosing a different game.');
 if(c.action==='spectate'){if(!r.members.has(actor)&&r.members.size>=66)fail('Spectator places are full.');for(const slot of r.slots)if(slot.actor===actor){slot.actor=null;slot.name='AI';}r.members.set(actor,{role:'spectator',at:this.now()});if(r.host===actor)r.host=r.slots.find(s=>s.actor)?.actor||null;}
 else {const requested=c.slot===undefined?r.slots.findIndex(s=>!s.actor||s.actor===actor):Number(c.slot);const slot=r.slots[requested];if(!slot||slot.actor&&slot.actor!==actor)fail('That player spot is occupied. Choose another spot or spectate.');this.leave(actor);slot.actor=actor;slot.name=String(identity.username||'Player').slice(0,32);r.members.set(actor,{role:'player',at:this.now()});r.host ||= actor;}
 }else{const member=r.members.get(actor);if(!member)fail('Join this room first.');member.at=this.now();if(c.action==='leave'){this.leave(actor);}
 else if(c.action==='watch'){}else {if(member.role!=='player')fail('Spectators cannot control or start the game.',403);const slot=r.slots.findIndex(s=>s.actor===actor);
 if(c.action==='start'||c.action==='restart'){if(r.host!==actor)fail('Only the host can start a round.',403);if(c.action==='restart'&&!r.match.snapshot().ended)fail('Finish this round before starting another.');r.started=true;r.match=createArcadeMatch(r.game,r.config);r.turn=0;}
 else if(c.action==='input'){if(r.started&&(r.game===3||slot===r.turn)){if(r.game===3&&slot===1)r.match.opponent(c.input);else r.match.input(c.input);}}
 else if(c.action==='action'){if(r.started&&!r.match.snapshot().ended&&slot===r.turn){r.match.input(c.input);const before=r.match.snapshot().attempts;r.match.action();if(r.match.snapshot().attempts>before)r.turn=1-r.turn;}}
 else fail('Unknown game action.',400);}}
 r.sequence++;return {selfId:actor,role:r.members.get(actor)?.role||'left',host:r.host,slots:structuredClone(r.slots),turn:r.turn,started:r.started,sequence:r.sequence,state:r.match.snapshot()};
 }
}
