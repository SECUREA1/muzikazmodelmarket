import test from 'node:test';
import assert from 'node:assert/strict';
import {stepEmergencyEvacuations,emergencyEvacuationView} from '../public/js/emergency-evacuation.js';
const environment={airport:{enabled:true,ceiling:80}};
function fixture(){
 const plane={id:'daybreak',modelId:'doomsday-evacuation-aircraft',active:true,health:400,holderId:null,position:{x:4,y:.4,z:110},flight:{airborne:false,altitude:0,airspeed:0}};
 const player={actorId:'pilot',health:100,lastSeen:1000,vehicleId:null,position:{x:0,y:0,z:0},score:25};
 return {sim:{doomsday:{id:'event-1',phase:'warning',nextEventAt:null,objectives:[{id:'supplies',completed:false},{id:'recovery',completed:false}]},players:{pilot:player},actors:{daybreak:plane},airport:{runwayHolder:'other'}},player,plane};
}
test('optional boarding, physical departure and safe climb complete once without changing the shared response or controls',()=>{
 const {sim,player,plane}=fixture(),event=structuredClone(sim.doomsday),lease=structuredClone(sim.airport);
 stepEmergencyEvacuations(sim,environment,1000);assert.equal(player.emergencyEvacuation.stage,'board');
 player.vehicleId=plane.id;plane.holderId='pilot';stepEmergencyEvacuations(sim,environment,1100);
 assert.equal(player.emergencyEvacuation.stage,'preflight');assert.equal(player.emergencyEvacuation.boardedAt,1100);
 Object.assign(plane.flight,{assist:'emergency-departure',assistStage:'taxi'});stepEmergencyEvacuations(sim,environment,1200);assert.equal(player.emergencyEvacuation.stage,'depart');
 Object.assign(plane.flight,{airborne:true,altitude:10,airspeed:14});plane.position.y=10.4;stepEmergencyEvacuations(sim,environment,1300);assert.equal(player.emergencyEvacuation.completedAt,null);
 plane.flight.altitude=24;plane.position.y=24.4;plane.flight.stall=true;stepEmergencyEvacuations(sim,environment,1400);assert.equal(player.emergencyEvacuation.completedAt,null);
 plane.flight.stall=false;stepEmergencyEvacuations(sim,environment,1500);assert.equal(player.emergencyEvacuation.status,'complete');assert.equal(player.emergencyEvacuation.completedAt,1500);
 player.vehicleId=null;plane.holderId=null;sim.doomsday.phase='all-clear';stepEmergencyEvacuations(sim,environment,1600);assert.equal(player.emergencyEvacuation.completedAt,1500);
 sim.doomsday.phase='warning';assert.deepEqual(sim.doomsday,event);assert.deepEqual(sim.airport,lease);assert.equal(player.score,25);assert.equal(plane.flight.assist,'emergency-departure','onboarding never owns flight controls');
});
test('no airborne flyover, wrong cockpit owner, destroyed craft or bot can claim evacuation boarding',()=>{
 for(const mode of ['airborne','foreign','destroyed','bot']){
  const {sim,player,plane}=fixture();player.vehicleId=plane.id;plane.holderId='pilot';
  if(mode==='airborne'){plane.flight.airborne=true;plane.flight.altitude=24;plane.flight.airspeed=14;plane.position.y=24.4;}
  if(mode==='foreign')plane.holderId='someone-else';if(mode==='destroyed')plane.health=0;if(mode==='bot')player.basketballAI=true;
  stepEmergencyEvacuations(sim,environment,1000);assert.notEqual(player.emergencyEvacuation?.status,'complete');assert.equal(player.emergencyEvacuation?.boardedAt??null,null);
 }
});
test('leaving an unfinished cockpit resets personal boarding; next event starts fresh and all-clear does not fake success',()=>{
 const {sim,player,plane}=fixture();player.vehicleId=plane.id;plane.holderId='pilot';stepEmergencyEvacuations(sim,environment,1000);
 player.vehicleId=null;stepEmergencyEvacuations(sim,environment,1100);assert.equal(player.emergencyEvacuation.stage,'board');
 sim.doomsday.phase='clearing';stepEmergencyEvacuations(sim,environment,1200);assert.equal(player.emergencyEvacuation.status,'ended');assert.equal(player.emergencyEvacuation.completedAt,null);
 sim.doomsday.id='event-2';sim.doomsday.phase='warning';stepEmergencyEvacuations(sim,environment,1300);assert.equal(player.emergencyEvacuation.eventId,'event-2');assert.equal(player.emergencyEvacuation.status,'available');
});
test('availability comes from public craft ownership; maps without flyable aircraft keep the shelter response',()=>{
 const {sim,plane}=fixture();let view=emergencyEvacuationView(sim,'pilot',environment);assert.equal(view.aircraft[0].available,true);assert.equal(view.canAssist,true);
 plane.holderId='other';view=emergencyEvacuationView(sim,'pilot',environment);assert.equal(view.aircraft[0].available,false);
 plane.holderId='pilot';assert.equal(emergencyEvacuationView(sim,'pilot',environment).aircraft[0].own,true);
 sim.actors={};stepEmergencyEvacuations(sim,environment,1000);assert.equal(sim.players.pilot.emergencyEvacuation,undefined);assert.deepEqual(emergencyEvacuationView(sim,'pilot',{}).aircraft,[]);
});
