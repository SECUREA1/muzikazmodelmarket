import test from 'node:test';
import assert from 'node:assert/strict';
import {neonMarina} from '../neon-marina.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {updateHarborBoat} from '../public/js/harbor-models.js';
import {isWatercraft,watercraftFootprint,watercraftOverlap,harborWaterAt} from '../public/js/harbor-water.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
const marina=neonMarina(),boat=marina.objects.find(o=>o.modelId==='harbor-yacht'),environment={builderScene:{layoutMeta:{harbor:marina.harbor},objects:marina.objects}};
test('superyacht fits its expanded berth and drives with full hull shoreline protection',()=>{
 assert.ok(isWatercraft(boat));assert.ok(marina.harbor.extent>256);
 assert.ok(watercraftFootprint(boat.position,0,boat).every(p=>harborWaterAt(environment,p,.25)));
 let moving={...boat};for(let i=0;i<20;i++)moving={...moving,...stepBoatSimulation(moving,{throttle:1},.1,{environment})};
 assert.ok(moving.position.z<boat.position.z-5);assert.ok(moving.boating.speed>0);
 const nearShore={...boat,position:{x:133,y:0,z:70}};assert.equal(watercraftFootprint(nearShore.position,0,boat).every(p=>harborWaterAt(environment,p,.25)),false);
 assert.ok(watercraftOverlap(boat.position,0,{x:141,z:118},0,.12,boat,{modelId:'harbor-skiff'}));
});
test('furnished rooms and animated adult performer stay attached to yacht',()=>{
 const model=createBuilderModel('harbor-yacht');for(const name of ['MASTER_BED_MATTRESS','LOUNGE_SOFA','AFT_SITTING_AREA','BILLIARDS_GREEN_FELT','DANCE_POLE','ADULT_POLE_PERFORMER','FLYBRIDGE_HELM'])assert.ok(model.getObjectByName(name),name);
 const dancer=model.getObjectByName('ADULT_POLE_PERFORMER');updateHarborBoat(model,{speed:4},2);assert.ok(dancer.rotation.y>0);assert.equal(dancer.parent,model);assert.ok(model.userData.dimensions[2]>=40);
});
