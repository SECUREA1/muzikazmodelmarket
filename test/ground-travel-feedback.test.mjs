import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const start=source.indexOf('  async function travelToGround('),end=source.indexOf('  function teleportFromController(',start);
function fixture(){
 let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),events=[],arrivals=[];
 const point=new THREE.Vector3(12.25,2.5,-7.75);
 const context=vm.createContext({THREE,worldLoadGeneration:4,groundTravelPending:false,serverHostedRoom:true,authoritativeClient:{selfId:'alice'},
  updateGameCamera(){},scene:{updateMatrixWorld(){}},envLoader:{collisionMeshes:[],floorMeshes:[]},buildingSolids:()=>[],constructionScene:{groundMeshes:[]},placementMeshes:()=>[],
  groundPointFromPointer:()=>point,teleportRay:{},displayCamera:()=>({}),canvas:{getBoundingClientRect:()=>({})},
  setStatus:message=>events.push(['status',message]),stage:{},gameActionLoading:()=>({begin:message=>{events.push(['begin',message]);return {finish:message=>events.push(['finish',message]),fail:message=>events.push(['fail',message])};}}),
  serverCommand:(action,fields)=>{events.push(['command',action,fields]);return promise;},updateLandingFrame:position=>arrivals.push(position),
 });
 vm.runInContext(source.slice(start,end),context);
 return {context,events,arrivals,point,resolve,reject};
}

test('ground selection displays loading before the server reply and marks its exact accepted position',async()=>{
 const f=fixture(),pending=f.context.travelToGround({});
 assert.equal(f.context.groundTravelPending,true);assert.equal(f.events[0][0],'begin');assert.equal(f.events[1][0],'command');
 assert.deepEqual(f.arrivals,[]);
 const state={selfId:'alice',players:{alice:{position:{x:12.25,y:2.52,z:-7.75}}}};f.resolve(state);
 assert.equal(await pending,state);assert.equal(f.context.groundTravelPending,false);
 assert.deepEqual(f.arrivals[0].toArray(),[12.25,2.52,-7.75]);assert.equal(f.events.at(-1)[0],'finish');
});

test('an obsolete ground reply settles loading without marking the replacement world',async()=>{
 const f=fixture(),pending=f.context.travelToGround({});f.context.worldLoadGeneration++;
 f.resolve({selfId:'alice',players:{alice:{position:{x:12.25,y:2.52,z:-7.75}}}});
 assert.equal(await pending,false);assert.deepEqual(f.arrivals,[]);assert.equal(f.events.at(-1)[0],'finish');assert.equal(f.context.groundTravelPending,false);
});

test('an obsolete ground failure cannot replace the new world status with an error',async()=>{
 const f=fixture(),pending=f.context.travelToGround({});f.context.worldLoadGeneration++;f.reject(Error('Old room disconnected.'));
 assert.equal(await pending,false);assert.deepEqual(f.arrivals,[]);assert.equal(f.events.at(-1)[0],'finish');assert.equal(f.context.groundTravelPending,false);
});

test('rejected or failed ground travel releases its pending state and displays a retryable failure',async()=>{
 const rejected=fixture(),rejectedMove=rejected.context.travelToGround({});rejected.resolve(false);
 assert.equal(await rejectedMove,false);assert.equal(rejected.events.at(-1)[0],'fail');assert.deepEqual(rejected.arrivals,[]);assert.equal(rejected.context.groundTravelPending,false);
 const failed=fixture(),failedMove=failed.context.travelToGround({});failed.reject(Error('That ground spot is blocked.'));
 await assert.rejects(failedMove,/blocked/);assert.deepEqual(failed.events.at(-1),['fail','That ground spot is blocked.']);assert.equal(failed.context.groundTravelPending,false);
});
