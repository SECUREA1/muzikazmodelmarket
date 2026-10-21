import test from 'node:test';
import assert from 'node:assert/strict';
import {boatAssistedInput,clearBoatAssist} from '../public/js/boat-assist.js';
import {boatAssistedInput as serverBoatAssistedInput} from '../server-boat-assist.mjs';
const environment={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}};
const vessel=()=>({id:'launch',modelId:'harbor-skiff',active:true,position:{x:144,y:0,z:-50},rotation:{y:-Math.PI/2},boating:{speed:0,assist:'launch',assistOrigin:{x:144,y:0,z:-50},assistSince:1000}});
test('server and local boat prediction use the same browser-safe helm resolver',()=>{
 assert.equal(serverBoatAssistedInput,boatAssistedInput);
 const boat=vessel(),input=boatAssistedInput(boat,{},environment,1100,{launch:boat});assert.equal(input.throttle,.32);assert.equal(input.anchor,false);assert.equal(boat.boating.assist,'launch');
});
test('local helm resolution drops assistance immediately on a manual input and brakes for forecast obstacles',()=>{
 const boat=vessel(),manual={rudder:.5};assert.equal(boatAssistedInput(boat,manual,environment,1100,{launch:boat}),manual);assert.equal(boat.boating.assist,null);assert.equal(boat.boating.assistOrigin,undefined);
 const approaching=vessel();approaching.boating.speed=4;const stopped=boatAssistedInput(approaching,{},environment,1100,{launch:approaching},()=>true);assert.equal(stopped.brake,true);assert.equal(stopped.throttle,0);assert.equal(approaching.boating.assist,'slow');
 approaching.boating.speed=0;boatAssistedInput(approaching,{},environment,1200,{launch:approaching});assert.equal(approaching.boating.assist,null);assert.equal(approaching.boating.throttleCommand,0);
 clearBoatAssist(boat);assert.equal(boat.boating.assistSince,undefined);
});
