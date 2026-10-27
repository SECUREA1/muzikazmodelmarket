import test from 'node:test';
import assert from 'node:assert/strict';
import {fitnessCueAt,fitnessKeyboardInput,nearestFitnessStation,fitnessCompetitionView} from '../public/js/fitness-ui.js';
import {FITNESS_ID,FITNESS_STATIONS} from '../public/js/fitness-config.js';
import {FITNESS_GAMES} from '../public/js/fitness-rules.js';

test('gym controls submit the allowed move vocabulary for drills and competitive sports',()=>{
 const keys={boxing:['j','k','l'],'bench-press':[' '],deadlift:[' '],agility:['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'],'jump-rope':[' '],rowing:['j','k'],balance:['ArrowLeft','ArrowRight'],'boxing-sparring':['j','k',' ','ArrowDown'],basketball:['ArrowLeft','ArrowRight',' '],'table-tennis':['j','k','l'],sprint:['ArrowLeft','ArrowRight',' ']};
 for(const station of FITNESS_STATIONS){const inputs=keys[station.kind].map(key=>fitnessKeyboardInput(key,station));assert.deepEqual([...new Set(inputs)].sort(),[...FITNESS_GAMES[station.kind].inputs].sort());}
 assert.equal(fitnessKeyboardInput('ArrowUp',FITNESS_STATIONS.find(s=>s.kind==='balance')),null);
 assert.equal(fitnessKeyboardInput('Escape',FITNESS_STATIONS[0]),null);
});

test('live cue index and legal timing window follow the server cue schedule',()=>{
 const round={startedAt:1000,intervalMs:1600,windowMs:410,cues:[{at:1800,input:'press'},{at:3400,input:'press'}],attempts:{}};
 assert.equal(fitnessCueAt(round,900).canHit,false);
 assert.deepEqual(fitnessCueAt(round,1800),{index:0,cue:round.cues[0],offset:0,canHit:true});
 assert.equal(fitnessCueAt(round,2211).canHit,false);
 assert.equal(fitnessCueAt(round,2600).index,1);
 assert.equal(fitnessCueAt(round,3400).canHit,true);
 round.attempts[1]={score:100};assert.equal(fitnessCueAt(round,3400).canHit,false);
 assert.equal(fitnessCueAt(null,2000).index,-1);
});

test('station prompts obey the server reach distance including elevation and copied gyms',()=>{
 const station=FITNESS_STATIONS[0],at=station.position;
 assert.equal(nearestFitnessStation({id:FITNESS_ID},at).id,station.id);
 assert.equal(nearestFitnessStation({id:FITNESS_ID},{...at,x:at.x+4.01}),null);
 assert.equal(nearestFitnessStation({id:FITNESS_ID},{...at,x:at.x+3,y:at.y+3}),null);
 assert.equal(nearestFitnessStation({id:'copied-gym',game:'fitness'},at).id,station.id);
 assert.equal(nearestFitnessStation({id:'other-world'},at),null);
});


test('copied gym prompts follow moved equipment and disappear when the station is removed',async()=>{
 const {createFitnessBuilderScene}=await import('../public/js/fitness-builder.js');
 const {fitnessStations}=await import('../public/js/fitness-config.js');
 const scene=createFitnessBuilderScene(),environment={id:'my-edited-gym',game:'fitness',builderScene:scene};
 const bench=scene.objects.find(item=>item.functionalSettings?.fitnessStation==='bench-press');
 const previous=fitnessStations(environment).find(item=>item.kind==='bench-press').position;
 bench.position.x+=10;
 const relocated=fitnessStations(environment).find(item=>item.kind==='bench-press');
 assert.equal(nearestFitnessStation(environment,relocated.position).id,relocated.id);
 assert.notEqual(nearestFitnessStation(environment,previous)?.id,relocated.id);
 scene.objects=scene.objects.filter(item=>item.id!==bench.id);
 assert.notEqual(nearestFitnessStation(environment,relocated.position)?.kind,'bench-press');
});


test('competitive input keys preserve distinct attack, defense and sports moves',()=>{
 assert.equal(fitnessKeyboardInput(' ',{kind:'boxing-sparring'}),'guard');
 assert.equal(fitnessKeyboardInput('ArrowDown',{kind:'boxing-sparring'}),'slip');
 assert.equal(fitnessKeyboardInput('ArrowLeft',{kind:'basketball'}),'aim-left');
 assert.equal(fitnessKeyboardInput('Enter',{kind:'basketball'}),'shoot');
 assert.equal(fitnessKeyboardInput('ArrowLeft',{kind:'table-tennis'}),'backhand');
 assert.equal(fitnessKeyboardInput(' ',{kind:'sprint'}),'hurdle');
 assert.equal(fitnessKeyboardInput('q',{kind:'boxing-sparring'}),null);
});

test('competitive scoreboard uses authoritative match points and outcome independently of precision XP',()=>{
 const round={kind:'boxing-sparring',score:1200,competition:{kind:'boxing-sparring',round:3,totalRounds:3,playerPoints:24,opponentPoints:18,playerHealth:79,opponentHealth:64,playerStamina:52,opponentStamina:48,rounds:[{number:1,playerPoints:8,opponentPoints:6,winner:'player'}],outcome:'win',winner:'player',unit:'points',opponent:{id:'rival',name:'Club Rival'},lastExchange:{input:'guard',playerQuality:100,opponentInput:'cross',at:123}}};
 const view=fitnessCompetitionView(round);
 assert.equal(view.playerPoints,24);assert.equal(view.opponentPoints,18);assert.notEqual(view.playerPoints,round.score);
 assert.equal(view.outcome,'win');assert.equal(view.round,3);assert.equal(view.playerHealth,79);assert.equal(view.lastExchange.input,'guard');assert.equal(view.opponent.name,'Club Rival');
 assert.equal(fitnessCompetitionView({kind:'boxing',score:1200}),null);
});

test('sports scoreboard preserves shot receipts, rally records and sprint timing',()=>{
 const shots=[{shotNo:1,made:false,points:0,opponentMade:true,opponentPoints:2}];
 assert.deepEqual(fitnessCompetitionView({kind:'basketball',competition:{shotResults:shots,totalRounds:4}}).shots,shots);
 const race=fitnessCompetitionView({kind:'sprint',competition:{unit:'m',distanceTarget:60,playerDistance:57,opponentDistance:55,playerTimeMs:14320,opponentTimeMs:14550,outcome:'win'}});
 assert.equal(race.playerDistance,57);assert.equal(race.distanceTarget,60);assert.equal(race.playerTimeMs,14320);
 const rally=fitnessCompetitionView({kind:'table-tennis',competition:{rallyLength:5,longestRally:8,playerPoints:4,opponentPoints:2}});
 assert.equal(rally.rallyLength,5);assert.equal(rally.longestRally,8);
});
