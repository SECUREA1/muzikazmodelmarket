import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionSteelStep} from '../public/js/construction-ui.js';

const site={tower:{target:{x:15,y:12,z:-4,yaw:Math.PI/2}}};
const rackLoad={load:'beam-0',hook:{x:-8,y:4.3,z:15},loadYaw:0,telemetry:{canRelease:true,releaseReason:'Steel supported at the delivery rack.'}};

test('a newly attached beam at the delivery rack advances to tower alignment rather than releasing it again',()=>{
 const next=constructionSteelStep(rackLoad,site);
 assert.equal(next.operation,'aim-target');assert.equal(next.label,'3 Align tower');
 const landed={...rackLoad,hook:{x:15,y:15.5,z:-4},loadYaw:Math.PI/2};
 assert.equal(constructionSteelStep(landed,site).operation,'release');
 assert.equal(constructionSteelStep({...landed,loadYaw:0},site).operation,'aim-target','position alone never permits guided placement with steel turned the wrong way');
});

test('guided placement respects authoritative structural readiness and keeps safe set-down distinct',()=>{
 const aligned={...rackLoad,hook:{x:15,y:15.5,z:-4},loadYaw:Math.PI/2,telemetry:{canRelease:true,canPlaceTower:false}};
 assert.equal(constructionSteelStep(aligned,site).operation,'aim-target','server obstruction or mating rejection overrides visual alignment');
 assert.equal(constructionSteelStep({...aligned,telemetry:{canRelease:true,canPlaceTower:true}},site).operation,'release');
 assert.equal(constructionSteelStep({...rackLoad,assist:'target'},site).busy,true,'active alignment cannot be restarted by the primary action');
});
