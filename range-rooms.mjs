import {RANGE_COURSES,RANGE_WEAPONS,rangeSettings,scoreRangeRay} from './public/js/range-rules.js';
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const miss=()=>({hit:false,zone:null,lane:null,points:0});

/** Shared waiting lobbies and server-scored firing-range courses. */
export class RangeRooms {
 constructor({now=Date.now}={}){this.now=now;this.rooms=new Map();}
 leave(actor){for(const room of this.rooms.values()){room.members.delete(actor);if(room.host===actor)room.host=[...room.members].find(([,member])=>member.role==='player')?.[0]||null;}}
 update(room,now){if(room.started&&!room.finished&&room.deadline!==null){room.remaining=Math.max(0,(room.deadline-now)/1000);if(!room.remaining)room.finished=true;}}
 tick(){const now=this.now();for(const [id,room]of this.rooms){for(const [actor,member]of room.members)if(now-member.at>15000)room.members.delete(actor);if(!room.members.size){this.rooms.delete(id);continue;}if(!room.members.has(room.host))room.host=[...room.members].find(([,member])=>member.role==='player')?.[0]||null;this.update(room,now);room.sequence++;}}
 snapshot(room,actor,result){return {selfId:actor,role:room.members.get(actor)?.role||'left',host:room.host,started:room.started,finished:room.finished,course:room.course,weapon:room.weapon,remaining:room.remaining,capacity:room.capacity,players:[...room.members].filter(([,member])=>member.role==='player').map(([id,member])=>({id,name:member.name,score:member.score,hits:member.hits,shots:member.shots})),sequence:room.sequence,...(result?{result}:{} )};}
 command(id,environment,identity,command={}){
  const actor='account:'+identity.accountId,now=this.now();let room=this.rooms.get(id),result;
  if(!room){if(!['join','spectate'].includes(command.action))fail('Join the range lobby first.');const settings=rangeSettings(command);room={...settings,members:new Map(),host:null,started:false,finished:false,capacity:5,remaining:RANGE_COURSES[settings.course].seconds,deadline:null,sequence:0};this.rooms.set(id,room);}
  this.update(room,now);
  if(command.action==='join'||command.action==='spectate'){
   const previous=room.members.get(actor),role=command.action==='spectate'?'spectator':'player';
   if(role==='player'&&previous?.role!=='player'&&room.started)fail('This course has started. Join the next lobby or spectate.');
   if(role==='player'&&previous?.role!=='player'&&[...room.members.values()].filter(member=>member.role==='player').length>=room.capacity)fail('All five firing-range lanes are occupied.');
   if(!previous&&room.members.size>=69)fail('This range lobby is full.');
   if(role==='player'&&!room.started&&!room.host){Object.assign(room,rangeSettings({course:command.course??room.course,weapon:command.weapon??room.weapon}));room.remaining=RANGE_COURSES[room.course].seconds;}
   // Moving between course rooms releases the old lane without deleting this
   // room's scores or host on reconnect.
   for(const other of this.rooms.values())if(other!==room&&other.members.has(actor)){other.members.delete(actor);if(other.host===actor)other.host=[...other.members].find(([,member])=>member.role==='player')?.[0]||null;}
   room.members.set(actor,{name:String(identity.username||'Player').slice(0,32),role,at:now,score:previous?.score||0,hits:previous?.hits||0,shots:previous?.shots||0,lastShot:previous?.lastShot??-Infinity,requests:previous?.requests||new Map()});
   if(role==='player')room.host ||= actor;else if(room.host===actor)room.host=[...room.members].find(([,member])=>member.role==='player')?.[0]||null;
  }else{
   const member=room.members.get(actor);if(!member)fail('Join the range lobby first.');member.at=now;
   if(command.action==='leave'){room.members.delete(actor);if(room.host===actor)room.host=[...room.members].find(([,member])=>member.role==='player')?.[0]||null;}
   else if(command.action==='watch'){}
   else{
    if(member.role!=='player')fail('Spectators cannot control a range course.',403);
    if(['start','reset','settings'].includes(command.action)){
     if(room.host!==actor)fail('Only the host can configure or start this course.',403);
     if(command.action==='reset'){room.started=false;room.finished=false;room.deadline=null;room.remaining=RANGE_COURSES[room.course].seconds;for(const player of room.members.values()){player.score=player.hits=player.shots=0;player.lastShot=-Infinity;player.requests.clear();}}
     else{
      if(room.started)fail('Return the course to its lobby before changing or starting it.');
      Object.assign(room,rangeSettings({course:command.course??room.course,weapon:command.weapon??room.weapon}));room.remaining=RANGE_COURSES[room.course].seconds;
      if(command.action==='start'){room.started=true;room.finished=false;room.deadline=room.remaining===null?null:now+room.remaining*1000;}
     }
    }else if(command.action==='shot'){
     const requestId=typeof command.requestId==='string'?command.requestId.slice(0,128):'';
     if(requestId&&member.requests.has(requestId))result=member.requests.get(requestId);
     else{
      if(!room.started||room.finished)fail('Wait for the host to start an active range course.');
      const limit=RANGE_COURSES[room.course].shots;if(limit!==null&&member.shots>=limit)fail('Your shot limit is reached. Wait for the next course.');
      if(now-member.lastShot+1<RANGE_WEAPONS[room.weapon].interval*1000)fail('Weapon is cooling down.',429);
      if(![command.origin,command.direction].every(vector=>vector&&['x','y','z'].every(axis=>Number.isFinite(vector[axis]))))fail('A finite shot origin and direction are required.',400);
      member.lastShot=now;member.shots++;result=scoreRangeRay(command.origin,command.direction,room.weapon)||miss();if(result.hit){member.hits++;member.score+=result.points;}
      if(requestId){member.requests.set(requestId,result);while(member.requests.size>128)member.requests.delete(member.requests.keys().next().value);}
      if(limit!==null&&[...room.members.values()].filter(player=>player.role==='player').every(player=>player.shots>=limit))room.finished=true;
     }
    }else fail('Unknown firing-range action.',400);
   }
  }
  room.sequence++;return this.snapshot(room,actor,result);
 }
}
