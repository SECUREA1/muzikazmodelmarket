import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';

const object=(id,modelId,x,z,behavior='decor')=>({id,name:id.replaceAll('-',' '),modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior,interactionDistance:4,cooldown:.1,destructible:false}});
const garden={id:'ai-conversation-garden',name:'AI Conversation Garden',spawn:{x:-8,y:0,z:-6},builderScene:{layout:'grand-floor',mapSize:64,objects:[object('garden-beacon','lever-switch',4,0,'switch'),object('garden-guide','street-sign',7,8,'talk')],layoutMeta:{locations:[{id:'arrival',name:'Garden arrival',x:-8,z:-6},{id:'beacon',name:'Garden beacon',x:4,z:0},{id:'reading',name:'Reading point',x:7,z:8}]}}};

async function fixture(t,environment){
 const directory=await mkdtemp(join(tmpdir(),'ai-conversation-live-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;const accounting={charges:0,rewards:0,factoryOrders:0};
 const store=new SharedRoomStore(join(directory,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>now,charge:async()=>{accounting.charges++;},reward:async()=>{accounting.rewards++;},factoryAction:async()=>{accounting.factoryOrders++;throw Error('AI may not fund a player production order.');},factoryState:async()=>({job:null,progress:{completedJobs:0},balance:1000})});
 const user={accountId:'worker',username:'Worker',stats:{health:100}},observer={accountId:'observer',username:'Observer',stats:{health:100}};
 const send=(action,fields={},identity=user)=>rooms.command(environment.id,environment,identity,{action,requestId:'ai-integration-'+ ++request,...fields});
 const joined=await send('join',{deferRadTox:true,radToxEnabled:false}),selfId=joined.selfId;
 await send('join',{deferRadTox:true,radToxEnabled:false},observer);
 await store.update(environment.id,room=>{room.simulation.players['account:observer'].position={x:-20,y:.02,z:-20};});
 const edit=fn=>store.update(environment.id,room=>fn(room.simulation));
 const tick=async(count=1)=>{let state;for(let index=0;index<count;index++){now+=250;state=await send('input',{input:{}});}return state;};
 const idleTick=async(count=1)=>{for(let index=0;index<count;index++){now+=250;await rooms.tickActive();}return rooms.snapshot(environment.id,environment);};
 const until=async(predicate,budget=700)=>{let state=await rooms.snapshot(environment.id,environment);for(let index=0;index<budget&&!predicate(state);index++)state=await tick();assert.ok(predicate(state),'Live work did not reach the expected phase: '+JSON.stringify({factory:state.factory,crew:state.construction?.crew,conversation:state.players[selfId].npcConversation,quest:state.players[selfId].vehicleMission}));return state;};
 return {environment,store,rooms,user,observer,accounting,send,selfId,edit,tick,idleTick,until,get now(){return now;},snapshot:()=>rooms.snapshot(environment.id,environment)};
}

test('a natural quest request operates the actual shared switch without claiming the player’s site objective',async t=>{
 const f=await fixture(t,garden);
 let state=await f.send('vehicle-mission',{operation:'start',questId:'map:'+garden.id+':service'}),quest=state.players[f.selfId].vehicleMission;
 assert.ok(quest.aiActions.some(action=>action.id==='world:switch:garden-beacon'),'the contact advertises the real switch '+JSON.stringify({actions:quest.aiActions,contact:state.actors[quest.contactId],target:state.actors['garden-beacon']}));
 const originalIndex=quest.index,originalScore=state.players[f.selfId].score;
 await f.send('vehicle-mission',{operation:'share'});
 await f.send('vehicle-mission',{operation:'join',teamId:quest.instanceId,role:'observer'},f.observer);
 await assert.rejects(f.send('vehicle-mission',{operation:'converse',choice:'question',text:'Please toggle the garden beacon.'},f.observer),/Join as a helper/);
 await assert.rejects(f.send('vehicle-mission',{operation:'converse',choice:'world:switch:not-an-offered-object'}),/listed conversation/);
 assert.equal((await f.snapshot()).actors['garden-beacon'].switched,false);
 state=await f.send('vehicle-mission',{operation:'converse',choice:'question',text:'Please toggle the garden beacon.'});
 assert.equal(state.actors[quest.contactId].aiTask.status,'active');assert.equal(state.actors['garden-beacon'].switched,false,'a conversation cannot instantly fake reaching the object');
 state=await f.until(value=>value.actors[quest.contactId]?.aiTask?.status==='completed',160);
 assert.equal(state.actors['garden-beacon'].switched,true);assert.equal(state.players[f.selfId].vehicleMission.index,originalIndex);assert.equal(state.players[f.selfId].score,originalScore);
 assert.equal(state.players[f.selfId].vehicleMission.aiWork.status,'completed');
 const otherView=await f.send('join',{deferRadTox:true,radToxEnabled:false},f.observer);assert.equal(otherView.selfId,'account:observer');assert.equal(otherView.actors['garden-beacon'].switched,true);assert.ok(otherView.events.some(event=>event.action==='ai-world-action'));
 assert.deepEqual(f.accounting,{charges:0,rewards:0,factoryOrders:0});
});

test('resident conversation delegates real hydraulic work and the observer sees finite excavated cargo',async t=>{
 const environment={id:'ai-construction-live',name:'AI Working Yard',spawn:{x:-11,y:0,z:-7},construction:{enabled:true,excavation:{x:.7,z:-3.69,width:4,depth:4,radius:2,maxDepth:2},stockpile:{x:20,z:0,width:8,depth:8},crew:{autoStart:false,muster:{x:-7,y:0,z:0}}},builderScene:{layout:'grand-floor',mapSize:64,objects:[object('yard-excavator','site-excavator',0,0,'vehicle'),object('yard-truck','site-dumptruck',5,0,'vehicle')],layoutMeta:{locations:[{id:'arrival',name:'Crew reception',x:-11,z:-7},{id:'yard',name:'Working yard',x:15,z:0}]}}};
 const f=await fixture(t,environment);
 await f.edit(sim=>{for(const worker of sim.construction.crew.workers)worker.enabled=worker.id==='crew-noor';});
 await f.edit(sim=>{sim.players[f.selfId].position={x:25,y:.02,z:25};});
 await assert.rejects(f.send('npc-social',{entityId:'crew-noor',choice:'work-demonstrate'}),/Move closer/);
 await f.edit(sim=>{sim.players[f.selfId].position={x:-11,y:.02,z:-7};});
 let state=await f.send('npc-social',{entityId:'crew-noor',choice:'work-demonstrate'});
 assert.equal(state.players[f.selfId].npcConversation.aiWorkContext.workerId,'crew-noor');
 const initial={...state.construction.crew.workers.find(worker=>worker.id==='crew-noor').position};
 state=await f.idleTick(12);const walked=state.construction.crew.workers.find(worker=>worker.id==='crew-noor').position;
 assert.ok(Math.hypot(walked.x-initial.x,walked.z-initial.z)>.5,'tickActive moves the operator with no client input or client-side simulation');
 state=await f.until(value=>value.construction.crew.workers.find(worker=>worker.id==='crew-noor').demonstration?.status==='completed');
 assert.equal(state.actors['yard-excavator'].construction.load,2,'the server’s work cycle extracted actual finite earth');
 assert.equal(state.construction.crew.jobs.find(job=>job.id==='dig').completed,2);assert.equal(state.players[f.selfId].npcConversation.aiWork.status,'completed');
 const otherView=await f.send('join',{deferRadTox:true,radToxEnabled:false},f.observer);assert.equal(otherView.selfId,'account:observer');assert.equal(otherView.actors['yard-excavator'].construction.load,2);assert.equal(otherView.players[f.selfId].score,0);assert.deepEqual(f.accounting,{charges:0,rewards:0,factoryOrders:0});
});

test('a requested world action yields at a player’s objective and can be stopped through the quest conversation',async t=>{
 const f=await fixture(t,{...garden,id:'ai-priority-garden'});
 let state=await f.send('vehicle-mission',{operation:'start',questId:'map:ai-priority-garden:service'}),quest=state.players[f.selfId].vehicleMission;
 state=await f.send('vehicle-mission',{operation:'converse',choice:'world:switch:garden-beacon'});
 await f.edit(sim=>{sim.players[f.selfId].position={x:4,y:.02,z:1.8};});
 state=await f.tick(12);
 assert.equal(state.actors[quest.contactId].aiTask.stage,'waiting');assert.equal(state.actors['garden-beacon'].switched,false);assert.equal(state.players[f.selfId].vehicleMission.index,0);
 state=await f.send('vehicle-mission',{operation:'converse',choice:'ai-stop'});
 assert.equal(state.actors[quest.contactId].aiTask.status,'cancelled');assert.equal(state.actors['garden-beacon'].switched,false);assert.equal(state.players[f.selfId].vehicleMission.aiWork.status,'cancelled');
 assert.deepEqual(f.accounting,{charges:0,rewards:0,factoryOrders:0});
});

test('factory staff run actual timed station cycles visible to both clients without buying or rewarding account items',async t=>{
 const f=await fixture(t,missileFactoryWorld());
 let workerId;
 await f.edit(sim=>{const worker=Object.values(sim.actors).find(actor=>actor.resident?.factory&&/machinist/.test(actor.id));assert.ok(worker);workerId=worker.id;sim.players[f.selfId].position={x:worker.position.x+3,y:worker.position.y,z:worker.position.z+3};});
 let state=await f.send('npc-social',{entityId:workerId,choice:'question',text:'Show me a production machine demonstration.'});
 assert.ok(state.factory.crewWork.job,'the request creates shared server work');assert.equal(state.factory.crewWork.outputs.length,0);
 state=await f.until(value=>value.factory.crewWork.job?.status==='processing',300);
 assert.ok(state.factory.crewWork.reservations.length);assert.ok(state.factory.jobs.some(row=>row.job.ai&&row.job.readyAt>f.now),'machine animation can read the authoritative timed cycle');
 const remaining=state.factory.crewWork.job.remainingMs,readyAt=state.factory.crewWork.job.readyAt;
 state=await f.idleTick(4);assert.equal(state.factory.crewWork.job.readyAt,readyAt);assert.ok(state.factory.crewWork.job.remainingMs<remaining,'the server ticker advances live processing without client input');
 state=await f.until(value=>value.factory.crewWork.completed===1,1000);
 assert.equal(state.factory.crewWork.materials.models,1);assert.equal(state.factory.crewWork.outputs.length,1);assert.equal(state.factory.crewWork.outputs[0].roomOnly,true);assert.equal(state.factory.crewWork.job.completedSteps.length,3);
 assert.equal(state.players[f.selfId].factory.job,null);assert.equal(state.players[f.selfId].factory.progress.completedJobs,0);assert.equal(state.players[f.selfId].score,0);
 const otherView=await f.send('join',{deferRadTox:true,radToxEnabled:false},f.observer);assert.equal(otherView.selfId,'account:observer');assert.equal(otherView.factory.crewWork.outputs[0].jobId,state.factory.crewWork.outputs[0].jobId);assert.deepEqual(f.accounting,{charges:0,rewards:0,factoryOrders:0});
});
