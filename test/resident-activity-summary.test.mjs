import test from 'node:test';
import assert from 'node:assert/strict';
import {residentActivitySummary} from '../public/js/resident-activity-summary.js';

test('resident presentation names the live objective, own team responsibility and individual identity',()=>{
 const info={appearance:{form:'foxfolk'},identity:{ambition:'discover every public landmark',quirk:'keeps a notebook'},objectivesCompleted:3,completedCommunityTasks:2,objective:{id:'tour',title:'Explore the garden',status:'active',index:1,checkpoints:[{name:'Activity board'},{name:'Garden overlook'},{name:'Return home'}]},sharedTask:{id:'handover',title:'Prepare equipment together',partnerId:'tala',stage:'Work together',responsibility:'Check the equipment list',progress:.5}},actors={tala:{resident:{name:'Tala Bright'}}},before=JSON.stringify(info);
 const summary=residentActivitySummary(info,actors);
 assert.match(summary.identity,/Foxfolk.*discover every public landmark.*keeps a notebook/);
 assert.equal(summary.objective.progress,1/3);assert.match(summary.objective.text,/Step 2 of 3: Garden overlook/);
 assert.match(summary.shared.text,/Tala Bright.*50%.*Check the equipment list/);
 assert.equal(summary.completedObjectives,3);assert.equal(summary.completedCommunityTasks,2);assert.equal(JSON.stringify(info),before);
});

test('older snapshots and finished objectives have useful bounded presentation',()=>{
 assert.deepEqual(residentActivitySummary(),{identity:'',form:'',ambition:'',quirk:'',objective:null,shared:null,completedObjectives:0,completedCommunityTasks:0});
 const summary=residentActivitySummary({objectivesCompleted:-4,completedCommunityTasks:Infinity,objective:{title:'Supply run',status:'completed',index:50,checkpoints:[{name:'Collect'},{name:'Deliver'}]},sharedTask:{title:'Prepare',elapsed:8,goal:16}});
 assert.equal(summary.objective.progress,1);assert.equal(summary.objective.index,2);assert.match(summary.objective.text,/Completed/);
 assert.equal(summary.shared.progress,.5);assert.match(summary.shared.text,/my teammate/);assert.equal(summary.completedObjectives,0);assert.equal(summary.completedCommunityTasks,0);
});
