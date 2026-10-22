import test from 'node:test';
import assert from 'node:assert/strict';
import {skiLifts,skiRuns,skiHeight,skiMotion,skiCourseGates,nearestSkiLift,startSkiLift,stepSkiLift,skiExitPoint} from '../public/js/ski-resort.js';
import {startSkiRace,stepSkiRace,skiCompetitionView} from '../server-ski-competition.mjs';
test('wide lift boarding and absolute ride time guarantee a summit exit after input gaps',()=>{
 const lift=skiLifts[0],p={position:{x:lift.from.x+19,y:.08,z:lift.from.z+15},skiing:true};assert.equal(nearestSkiLift(p.position).id,lift.id);assert.equal(nearestSkiLift({x:0,y:0,z:370}),null);startSkiLift(p,lift,10000);assert.equal(p.skiing,false);stepSkiLift(p,.05,45000);assert.equal(p.skiLift.progress,.5);assert.ok(p.position.z<-40);stepSkiLift(p,.05,81000);assert.equal(p.skiLift,null);assert.deepEqual(p.position,skiExitPoint(lift));assert.equal(p.skiing,true);assert.equal(p.yaw,Math.PI);assert.equal(p.grounded,true);assert.equal(p.skiSpeed,0);
});
test('lift stations and warming hut have level terrain pads and tapered ramp sides',()=>{for(const lift of skiLifts)for(const end of [lift.from,lift.to])for(const dx of [-15,0,15])assert.ok(Math.abs(skiHeight(end.x+dx,end.z+8)-skiHeight(end.x,end.z))<1e-9);assert.equal(skiHeight(-251,-40),skiHeight(-245,-40));assert.ok(Math.abs(skiHeight(203,25)-skiHeight(203.01,25))<.05);});
test('ski turns are bounded and assisted racing follows a smooth downhill direction',()=>{const p={position:{x:0,y:90,z:0},yaw:Math.PI,skiHeading:0,skiSpeed:20};skiMotion(p,{forward:1},.05);assert.ok(Math.abs(p.skiHeading)<=.111,'no instant 180 degree velocity turn');const assisted={position:{x:20,y:90,z:0},yaw:0,skiHeading:Math.PI,skiSpeed:15,skiRace:{status:'racing',courseId:'glacier-run'}};const step=skiMotion(assisted,{forward:1},.05);assert.ok(step.z>0);assert.ok(Math.abs(step.x-assisted.position.x)<.15);});
function racer(){return {actorId:'alice',username:'Alice',position:{x:0,y:180,z:-380},skiing:true,skiSpeed:20,grounded:true,score:0};}
test('ordered gates produce a medal and one authoritative leaderboard result; teleport and missed gates cannot score',()=>{
 const sim={},p=racer(),run=skiRuns[1],gates=skiCourseGates(run);startSkiRace(p,run,1000);p.skiSpeed=20;
 for(const [i,gate]of gates.entries()){const previous={x:gate.x,y:gate.y+.02,z:gate.z-.5};p.position={x:gate.x,y:gate.y+.02,z:gate.z+.5};stepSkiRace(sim,p,previous,1000+(i+1)*4500);}
 assert.equal(p.skiRace.status,'finished');assert.equal(p.skiRace.medal,'Gold');assert.ok(p.skiStats.totalPoints>2000);assert.equal(p.skiStats.finishes,1);assert.equal(skiCompetitionView(sim).boards[run.id][0].username,'Alice');const earned=p.score;stepSkiRace(sim,p,p.position,100000);assert.equal(p.score,earned,'finish cannot pay twice');
 const cheat=racer();startSkiRace(cheat,run,0);cheat.position={x:0,y:0,z:280};stepSkiRace(sim,cheat,{x:0,y:180,z:-380},1000);assert.equal(cheat.skiRace.status,'cancelled');assert.equal(cheat.score,0);
 const missed=racer();startSkiRace(missed,run,0);missed.position={x:100,y:gates[0].y,z:gates[0].z+19};stepSkiRace(sim,missed,{x:100,y:gates[0].y,z:gates[0].z+18},1000);assert.equal(missed.skiRace.status,'missed');assert.equal(missed.score,0);
});
test('clean jump landings award a bounded bonus instead of unlimited stationary jumping',()=>{const p=racer(),sim={};startSkiRace(p,skiRuns[1],1000);p.position={x:0,y:100,z:-340};p.grounded=false;stepSkiRace(sim,p,{x:0,y:100,z:-341},2000);p.position.z=-330;p.grounded=true;stepSkiRace(sim,p,{x:0,y:100,z:-331},3000);assert.equal(p.skiRace.points,120);assert.equal(p.skiRace.jumps,1);});
