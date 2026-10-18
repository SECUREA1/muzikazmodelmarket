import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {
 ARCADE_ATTRACTIONS, arcadeSettings, arcadeAttractions, isArcadeMap,
 createArcadeSession, enterArcadeAttraction, exitArcadeAttraction,
 stepArcadeRide, arcadeRidePose, localArcadePoints
} from '../public/js/arcade-rules.js';
import {createArcadePark, animateArcadePark} from '../public/js/arcade-park.js';

const ids=['hockey','shooting','basketball','air-hockey','billiards','train','coaster'];
const finiteVector=vector=>[vector.x,vector.y,vector.z].every(Number.isFinite);
const park=createArcadePark();
function dispose(root){root.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});}
after(()=>dispose(park.root));

test('arcade defaults offer all seven attractions with independent mutable settings',()=>{
 assert.deepEqual(ARCADE_ATTRACTIONS.map(a=>a.id),ids);
 const defaults=arcadeSettings();
 assert.deepEqual(defaults.enabled,ids);
 assert.equal(defaults.difficulty,'easy');
 assert.equal(defaults.roundSeconds,45);
 const separate=arcadeSettings();
 defaults.enabled.length=0;
 defaults.placements.hockey.x=99;
 assert.deepEqual(separate.enabled,ids);
 assert.equal(separate.placements.hockey.x,-13);
 assert.deepEqual(arcadeSettings(null),separate);
});

test('builder settings bound round, ride and coaster limits and reject invalid difficulty',()=>{
 const low=arcadeSettings({roundSeconds:-5,trainLapSeconds:-1,coasterLapSeconds:0,coasterPeak:-50,difficulty:'expert'});
 assert.deepEqual([low.roundSeconds,low.trainLapSeconds,low.coasterLapSeconds,low.coasterPeak],[15,20,15,6]);
 assert.equal(low.difficulty,'easy');
 const high=arcadeSettings({roundSeconds:1e12,trainLapSeconds:1e12,coasterLapSeconds:1e12,coasterPeak:1e12,difficulty:'normal'});
 assert.deepEqual([high.roundSeconds,high.trainLapSeconds,high.coasterLapSeconds,high.coasterPeak],[180,120,90,22]);
 assert.equal(high.difficulty,'normal');
 const invalid=arcadeSettings({roundSeconds:NaN,trainLapSeconds:Infinity,coasterLapSeconds:'invalid',coasterPeak:-Infinity});
 assert.deepEqual([invalid.roundSeconds,invalid.trainLapSeconds,invalid.coasterLapSeconds,invalid.coasterPeak],[45,55,32,13]);
 assert.equal(arcadeSettings({roundSeconds:'60'}).roundSeconds,60);
});

test('builder filters duplicate and unknown attractions and permits an explicitly closed park',()=>{
 const config={enabled:['train','air-hockey','train','unknown',null]};
 assert.deepEqual(arcadeSettings(config).enabled,['train','air-hockey']);
 assert.deepEqual(arcadeAttractions(config).filter(a=>a.enabled).map(a=>a.id),['air-hockey','train']);
 assert.deepEqual(arcadeSettings({enabled:[]}).enabled,[]);
 assert.deepEqual(arcadeSettings({enabled:'train'}).enabled,ids);
 assert.deepEqual(config.enabled,['train','air-hockey','train','unknown',null]);
});

test('builder placements stay within the park while leaving unspecified attraction defaults intact',()=>{
 const input={placements:{hockey:{x:999,z:-999},billiards:{x:'2.5',z:Infinity},train:{x:0,z:0}}};
 const settings=arcadeSettings(input),attractions=arcadeAttractions(input);
 assert.deepEqual(settings.placements.hockey,{x:18,z:-11,rotation:0,scale:1,color:'#8ee6ed'});
 assert.deepEqual(settings.placements.billiards,{x:2.5,z:9,rotation:0,scale:1,color:'#b6a0ed'});
 assert.deepEqual(settings.placements.basketball,{x:13,z:-7,rotation:0,scale:1,color:'#efa963'});
 assert.equal(attractions.find(a=>a.id==='train').x,12);
 assert.equal(attractions.find(a=>a.id==='hockey').x,18);
 assert.equal(input.placements.hockey.x,999);
});

test('arcade maps are recognized from both saved game metadata and builder layouts',()=>{
 assert.equal(isArcadeMap({game:'arcade'}),true);
 assert.equal(isArcadeMap({layout:'arcade-park'}),true);
 assert.equal(isArcadeMap({builderScene:{layout:'arcade-park'}}),true);
 assert.equal(isArcadeMap({game:'hockey',layout:'rink'}),false);
 assert.equal(isArcadeMap(),false);
});

test('only enabled attractions can be entered and visits remain unique across replays',()=>{
 const session=createArcadeSession({enabled:['billiards']});
 assert.equal(enterArcadeAttraction(session,'hockey'),false);
 assert.equal(enterArcadeAttraction(session,'unknown'),false);
 assert.equal(session.mode,'explore');
 assert.deepEqual(session.visited,[]);
 assert.equal(enterArcadeAttraction(session,'billiards'),true);
 assert.equal(session.mode,'game');
 assert.equal(session.attraction,'billiards');
 assert.equal(session.ride,null);
 exitArcadeAttraction(session);
 assert.equal(enterArcadeAttraction(session,'billiards'),true);
 assert.deepEqual(session.visited,['billiards']);
});

test('boarding either ride locks its seat and prevents attraction switching until exit',()=>{
 for(const type of ['train','coaster']){
  const session=createArcadeSession({trainLapSeconds:23,coasterLapSeconds:17});
  assert.equal(enterArcadeAttraction(session,type),true);
  assert.equal(session.mode,'ride');
  assert.equal(session.ride.type,type);
  assert.equal(session.ride.locked,true);
  assert.equal(session.ride.duration,type==='train'?23:17);
  const before=structuredClone(session);
  for(const destination of ids)assert.equal(enterArcadeAttraction(session,destination),false,destination);
  assert.deepEqual(session,before);
 }
});

test('rider cancellation clears the lock and permits another attraction without completing a lap',()=>{
 const session=createArcadeSession();
 enterArcadeAttraction(session,'coaster');
 stepArcadeRide(session,.05);
 exitArcadeAttraction(session);
 assert.equal(session.mode,'explore');
 assert.equal(session.ride,null);
 assert.equal(session.attraction,null);
 assert.deepEqual(session.lastRide,{type:'coaster',reason:'exit',completed:false});
 assert.equal(enterArcadeAttraction(session,'air-hockey'),true);
 assert.equal(session.mode,'game');
});

test('hidden tabs pause ride progress and invalid frame deltas cannot advance a ride',()=>{
 const session=createArcadeSession();
 enterArcadeAttraction(session,'train');
 stepArcadeRide(session,.05);
 const before={...session.ride};
 assert.equal(stepArcadeRide(session,60,{hidden:true}),false);
 for(const delta of [0,-1,NaN,Infinity,'invalid'])assert.equal(stepArcadeRide(session,delta),false);
 assert.deepEqual(session.ride,before);
 stepArcadeRide(session,60);
 assert.ok(session.ride.elapsed>before.elapsed);
 assert.ok(session.ride.elapsed<=before.elapsed+.1000001,'returning to a tab cannot skip the whole ride');
});

test('full train and coaster laps complete once, unlock the rider and retain completion status',()=>{
 for(const type of ['train','coaster']){
  const session=createArcadeSession({trainLapSeconds:20,coasterLapSeconds:15});
  enterArcadeAttraction(session,type);
  const duration=session.ride.duration;
  for(let i=0;i<duration*10-1;i++)assert.equal(stepArcadeRide(session,.1),false);
  assert.equal(session.mode,'ride');
  assert.ok(session.ride.progress>.99);
  assert.equal(stepArcadeRide(session,.1),true);
  assert.equal(session.mode,'explore');
  assert.equal(session.ride,null);
  assert.deepEqual(session.lastRide,{type,reason:'complete',completed:true});
  assert.equal(stepArcadeRide(session,.1),false);
  assert.equal(enterArcadeAttraction(session,'hockey'),true);
 }
});

test('saved local points are finite bounded integers even with damaged browser storage',()=>{
 for(const [input,expected] of [[undefined,0],[null,0],['invalid',0],[Infinity,0],[NaN,0],[-9,0],[12.99,12],['2048',2048],[1e12,99999999]]){
  assert.equal(localArcadePoints(input),expected,String(input));
 }
});

test('park scene supplies all attraction entry meshes, train carriages and the coaster car',()=>{
 assert.equal(park.root.userData.arcadePark,true);
 assert.equal(park.root.name,'NEON_JUNCTION_ARCADE_PARK');
 assert.deepEqual(park.clickMeshes.map(mesh=>mesh.userData.index),[0,1,2,3,4,5,6]);
 assert.equal(park.trains.length,4);
 assert.ok(park.root.getObjectByName('ARCADE_TRAIN_ENGINE'));
 assert.ok(park.root.getObjectByName('ARCADE_TRAIN_BOARDING'));
 assert.ok(park.root.getObjectByName('ARCADE_COASTER_BOARDING'));
 assert.equal(park.root.getObjectByName('ARCADE_COASTER_CAR'),park.cart);
});

test('train runs around all four sides of the park and coaster climbs above its ground route',()=>{
 const train=Array.from({length:160},(_,i)=>park.trainCurve.getPointAt(i/160));
 assert.ok(train.every(finiteVector));
 assert.ok(Math.min(...train.map(p=>p.x))<=-23);
 assert.ok(Math.max(...train.map(p=>p.x))>=23);
 assert.ok(Math.min(...train.map(p=>p.z))<=-15);
 assert.ok(Math.max(...train.map(p=>p.z))>=15);
 assert.ok(train.every(p=>Math.abs(p.x)>17||Math.abs(p.z)>10),'perimeter rail surrounds the attractions');
 const coaster=Array.from({length:160},(_,i)=>park.coaster.getPointAt(i/160));
 assert.ok(coaster.every(finiteVector));
 assert.ok(Math.max(...coaster.map(p=>p.y))>12);
 assert.ok(Math.min(...coaster.map(p=>p.y))<3);
 assert.ok(Math.min(...coaster.map(p=>p.y))>0);
 assert.ok(park.trainCurve.getPointAt(0).distanceTo(park.trainCurve.getPointAt(1))<1e-8);
 assert.ok(park.coaster.getPointAt(0).distanceTo(park.coaster.getPointAt(1))<1e-8);
});

test('ride camera poses wrap safely and provide finite eye and look targets throughout each route',()=>{
 for(const type of ['train','coaster'])for(const phase of [-1.2,-.01,0,.2,.999,1,2.1,undefined,NaN,Infinity,-Infinity,'invalid']){
  const pose=arcadeRidePose(type,phase),curve=type==='train'?park.trainCurve:park.coaster;
  assert.ok(pose.phase>=0&&pose.phase<1);
  assert.ok(pose.eyeHeight>0&&Number.isFinite(pose.eyeHeight));
  assert.ok(pose.lookAhead>0&&pose.lookAhead<.1);
  const eye=curve.getPointAt(pose.phase);eye.y+=pose.eyeHeight;
  const look=curve.getPointAt((pose.phase+pose.lookAhead)%1);look.y+=.9;
  assert.ok(finiteVector(eye)&&finiteVector(look));
  assert.ok(eye.distanceTo(look)>.1);
 }
});

test('scene animation moves rides along their curves and closes a full lap without drifting',()=>{
 const config={trainLapSeconds:20,coasterLapSeconds:20};
 animateArcadePark(park.root,0,config);
 const initialTrain=park.trains.map(train=>train.position.clone()),initialCart=park.cart.position.clone();
 const halfway=animateArcadePark(park.root,10,config);
 assert.deepEqual(halfway,{trainT:.5,coasterT:.5});
 assert.ok(park.trains.every((train,index)=>train.position.distanceTo(initialTrain[index])>10));
 assert.ok(park.cart.position.distanceTo(initialCart)>10);
 for(const object of [...park.trains,park.cart]){
  assert.ok(finiteVector(object.position));
  assert.ok([object.quaternion.x,object.quaternion.y,object.quaternion.z,object.quaternion.w].every(Number.isFinite));
 }
 animateArcadePark(park.root,20,config);
 park.trains.forEach((train,index)=>assert.ok(train.position.distanceTo(initialTrain[index])<1e-8));
 assert.ok(park.cart.position.distanceTo(initialCart)<1e-8);
 assert.equal(animateArcadePark({},10),null);
});

test('custom coaster height and table placements change the builder scene',()=>{
 const custom=createArcadePark({coasterPeak:21,placements:{'air-hockey':{x:-3,z:4}}});
 try{
  const platform=custom.clickMeshes.find(mesh=>mesh.userData.index===3);
  assert.equal(platform.getWorldPosition(platform.position.clone()).x,-3);
  assert.equal(platform.getWorldPosition(platform.position.clone()).z,4);
  const peak=Math.max(...Array.from({length:160},(_,i)=>custom.coaster.getPointAt(i/160).y));
  assert.ok(peak>=20.5);
 }finally{dispose(custom.root);}
});

test('malformed animation times reset safely without producing invalid ride transforms',()=>{
 for(const elapsed of [Infinity,-Infinity,NaN,undefined,'invalid']){
  const phases=animateArcadePark(park.root,elapsed);
  assert.deepEqual(phases,{trainT:0,coasterT:0});
  for(const object of [...park.trains,park.cart]){
   assert.ok(finiteVector(object.position));
   assert.ok([object.quaternion.x,object.quaternion.y,object.quaternion.z,object.quaternion.w].every(Number.isFinite));
  }
 }
});
