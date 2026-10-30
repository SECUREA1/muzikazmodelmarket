import test from 'node:test';
import assert from 'node:assert/strict';
import {shelterGuidance} from '../public/js/shelter-guidance.js';
import {doomsdayForEnvironment} from '../public/js/doomsday-config.js';
import {isDoomsdayObjectiveNearby} from '../public/js/doomsday-rules.js';
test('placed shelters generate rotated interior checkpoints while explicit map sites take precedence',()=>{
 const environment={builderScene:{mapSize:200,objects:[{modelId:'fallout-shelter',position:{x:30,y:2,z:20},rotation:{y:Math.PI/2}}]}};
 const shelter=doomsdayForEnvironment(environment).objectives[0];
 assert.deepEqual(shelter.position,{x:30,y:2,z:20});
 assert.equal(isDoomsdayObjectiveNearby({x:33.7,y:2,z:24.5},shelter),true);
 assert.equal(isDoomsdayObjectiveNearby({x:34,y:2,z:20},shelter),false);
 assert.equal(isDoomsdayObjectiveNearby({x:30,y:6,z:20},shelter),false);
 environment.builderScene.objects.push({modelId:'fallout-shelter',position:{x:3,y:0,z:2}});
 assert.equal(doomsdayForEnvironment(environment).objectives[0].position.x,3,'choose the shelter nearest arrival');
 environment.doomsday={objectives:[{id:'shelter',position:{x:1,y:0,z:1}}]};
 assert.equal(doomsdayForEnvironment(environment).objectives[0].position.x,1);
});
test('personal shelter guidance follows actual presence even after another visitor completes the shared objective',()=>{
 const state={active:true,phase:'warning',objectives:[{id:'shelter',name:'Shelter',completed:true,position:{x:0,y:0,z:0}}]};
 assert.equal(shelterGuidance(state,{x:20,y:0,z:0}).label,'20 m to shelter');
 assert.equal(shelterGuidance(state,{x:0,y:0,z:0}).inside,true);
 state.phase='fallout';assert.match(shelterGuidance(state,{x:0,y:0,z:0}).message,/supplies/);
 state.phase='recovery';assert.match(shelterGuidance(state,{x:0,y:0,z:0}).message,/relay/);
 state.active=false;assert.equal(shelterGuidance(state,{x:0,y:0,z:0}).visible,false);
});
