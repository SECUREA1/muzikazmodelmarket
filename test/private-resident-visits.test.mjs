import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivateResidentRooms} from '../server-private-residents.mjs';

test('solo social visits receive real walking, vehicle and teleport state without moving the player',()=>{
 let now=100000;
 const collision={groundAt:(_env,p)=>({...p}),hasBodyClearance:()=>true,resolve:(_env,_from,to)=>({...to}),withActorCandidates:(_actors,run)=>run()};
 const environment={id:'solo-visits',builderScene:{mapSize:100,objects:[],layoutMeta:{locations:[{id:'garden',name:'Garden',x:0,y:0,z:0},{id:'stage',name:'Music stage',x:12,y:0,z:0}]}}};
 const runtime=new PrivateResidentRooms({collision,now:()=>now}),identity={accountId:'alice',username:'Alice'};
 const send=fields=>runtime.command(environment,identity,{action:'input',position:{x:0,y:0,z:0},...fields});
 const initial=send({action:'join',movementRevision:1}),npc=Object.values(initial.actors).find(a=>a.resident);
 now+=1200;
 send({action:'npc-social',position:{...npc.position},choice:'resident-invite',entityId:npc.id});
 now+=1200;
 const accepted=send({action:'npc-social',position:{...npc.position},choice:'resident-join',entityId:npc.id});
 const point=accepted.players[accepted.selfId].residentVisit.checkpoints[0];
 now+=1500;
 assert.throws(()=>send({action:'npc-social',position:{x:point.x,y:point.y,z:point.z},vehicleId:'solo-car',choice:'resident-visit-confirm',entityId:npc.id}),/stop safely/);
 now+=1200;
 const moved=send({position:{x:point.x,y:point.y,z:point.z},movementRevision:2,grounded:false});
 assert.equal(moved.players[moved.selfId].residentVisit.status,'cancelled','a same-map local teleport invalidates the walking visit');
 assert.equal(moved.players[moved.selfId].grounded,false);
 assert.deepEqual(moved.players[moved.selfId].position,{x:point.x,y:point.y,z:point.z});
 assert.equal(moved.players[moved.selfId].score,0);
});
