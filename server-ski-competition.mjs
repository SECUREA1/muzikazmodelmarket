import {skiRuns,skiCourseGates} from './public/js/ski-resort.js';
export function startSkiRace(player,run,now){player.skiRace={courseId:run.id,status:'racing',startedAt:now,gate:0,gateCount:skiCourseGates(run).length,points:0,jumps:0,airborneAt:null,message:'Follow the '+run.name+' gates'};player.skiing=true;player.skiSpeed=3;player.skiHeading=Math.PI;player.yaw=Math.PI;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;}
export function stepSkiRace(sim,player,previous,now){
 const race=player.skiRace;if(!race||race.status!=='racing')return;
 if(!player.skiing||player.skiLift){race.status='cancelled';race.message='Run ended. Start another race when ready.';return;}
 if(Math.hypot(player.position.x-previous.x,player.position.z-previous.z)>12){race.status='cancelled';race.message='Travel resets a competitive run.';return;}
 const run=skiRuns.find(run=>run.id===race.courseId);if(!run)return;const gates=skiCourseGates(run);
 if(!player.grounded&&race.airborneAt===null){race.airborneAt=now;race.jumpFrom={...previous};}
 if(player.grounded&&race.airborneAt!==null){const flight=(now-race.airborneAt)/1000,travel=Math.hypot(player.position.x-race.jumpFrom.x,player.position.z-race.jumpFrom.z);if(flight>=.35&&travel>=8&&race.jumps<3){const bonus=Math.min(500,Math.round(flight*120));race.points+=bonus;race.jumps++;race.message='Clean landing +'+bonus;}race.airborneAt=null;}
 const gate=gates[race.gate];if(player.position.z>gate.z+18){race.status='missed';race.message='Missed gate '+(race.gate+1)+'. Race again for a clean run.';return;}
 if(previous.z<gate.z&&player.position.z>=gate.z){const t=(gate.z-previous.z)/(player.position.z-previous.z),x=previous.x+(player.position.x-previous.x)*t;if(Math.abs(x-gate.x)<=gate.width/2&&Math.abs(player.position.y-gate.y)<12){const points=100+Math.min(60,Math.round((player.skiSpeed||0)*2));race.points+=points;race.gate++;race.message='Gate '+race.gate+'/'+gates.length+' +'+points;}}
 if(race.gate!==gates.length)return;
 const seconds=Math.max(1,(now-race.startedAt)/1000),par=run.id==='pine-trail'?58:run.id==='glacier-run'?48:run.id==='black-diamond'?42:34;
 race.status='finished';race.finishedAt=now;race.seconds=Number(seconds.toFixed(2));race.points+=1000+Math.round(Math.max(0,par*1.5-seconds)*10);race.medal=seconds<=par?'Gold':seconds<=par*1.4?'Silver':'Bronze';race.message=race.medal+' finish · '+race.points+' points · '+race.seconds+'s';
 player.skiStats||={totalPoints:0,finishes:0};player.skiStats.totalPoints+=race.points;player.skiStats.finishes++;player.score=(player.score||0)+race.points;
 sim.skiCompetition||={boards:{}};const board=sim.skiCompetition.boards[run.id]||={};const prior=board[player.actorId],record={actorId:player.actorId,username:player.username,points:race.points,seconds:race.seconds,medal:race.medal,at:now};if(!prior||record.points>prior.points||record.points===prior.points&&record.seconds<prior.seconds)board[player.actorId]=record;
 const records=Object.values(board).sort((a,b)=>b.points-a.points||a.seconds-b.seconds);for(const extra of records.slice(128))delete board[extra.actorId];
}
export function skiCompetitionView(sim){if(!sim.skiCompetition)return null;return {boards:Object.fromEntries(Object.entries(sim.skiCompetition.boards).map(([id,board])=>[id,Object.values(board).sort((a,b)=>b.points-a.points||a.seconds-b.seconds).slice(0,10)]))};}
