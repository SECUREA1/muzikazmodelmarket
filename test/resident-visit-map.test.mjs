import test from 'node:test';
import assert from 'node:assert/strict';
import {localMapTags} from '../public/js/local-map-tags.js';

const environment={id:'garden-map',spawn:{x:0,y:0,z:0},builderScene:{objects:[]}};
const visit={id:'garden-visit',residentId:'host',worldId:environment.id,title:'Explore the garden',status:'active',index:0,deadline:9000,checkpoints:[{name:'Garden public approach',x:18,y:2,z:12,radius:4}]};
const snapshot=state=>({serverTime:1000,actors:{},players:{alice:{position:{x:1,y:0,z:1},residentVisit:state},bob:{position:{x:2,y:0,z:2},residentVisit:{...visit,id:'bobs-private-visit'}}}});
const marker=(state,world=environment)=>localMapTags(world,snapshot(state),'alice').filter(tag=>tag.residentVisitId);

test('accepted resident invitations mark the actual public checkpoint for the current player',()=>{
 const [tag]=marker(visit);
 assert.equal(tag.id,'resident-visit:garden-visit');assert.equal(tag.kind,'mission');
 assert.deepEqual([tag.x,tag.y,tag.z],[18,2,12]);assert.equal(tag.visitResidentId,'host');
 assert.match(tag.description,/Walk here.*confirm arrival/);
 assert.equal(marker(visit).length,1,'another player invitation is not shown');
 assert.equal(tag.locationId,undefined,'an invitation is reached on foot rather than offered as map teleport');
});

test('ended, expired, stale-world and malformed visits never leave an active marker',()=>{
 for(const status of ['offered','completed','cancelled','expired'])assert.equal(marker({...visit,status}).length,0,status);
 assert.equal(marker({...visit,deadline:500}).length,0);
 assert.equal(marker({...visit,worldId:'previous-map'}).length,0);
 assert.equal(marker({...visit,checkpoints:[]}).length,0);
 assert.equal(marker({...visit,index:2}).length,0);
 assert.equal(marker({...visit,checkpoints:[{name:'Bad stop',x:NaN,z:12}]}).length,0);
});
