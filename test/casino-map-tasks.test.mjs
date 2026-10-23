import test from 'node:test';
import assert from 'node:assert/strict';
import {questCatalog,questMapTags} from '../public/js/quest-catalog.js';
import {localMapTags} from '../public/js/local-map-tags.js';

test('casino staff favors use walking markers without vehicle or generic dispatch assignments',()=>{
 const environment={id:'muzikaz-casino',game:'casino',spawn:{x:0,y:0,z:32},builderScene:{layout:'casino',objects:[],layoutMeta:{locations:[{id:'poker',name:'Poker',x:-20,z:9},{id:'cashier',name:'Cashier',x:22,z:29}]}}};
 assert.deepEqual(questCatalog(environment),[]);
 const live={players:{me:{position:{x:0,y:0,z:19},casinoTask:{id:'favor-1',status:'active',index:0,checkpoints:[{name:'Check the poker approach',x:-15,y:.02,z:9}]}}},actors:{}};
 const marker=localMapTags(environment,live,'me').find(tag=>tag.id==='casino-favor:favor-1');
 assert.ok(marker);assert.equal(marker.walkOnly,true);assert.equal(marker.x,-15);assert.equal(marker.locationId,undefined);assert.equal(marker.entityId,undefined);assert.equal(marker.arrival,undefined);
 assert.match(marker.description,/walk/);
 live.players.me.casinoTask.status='cancelled';assert.deepEqual(questMapTags(live,'me'),[]);
});

test('a staff favor follows its actual guest and safely omits an unavailable contact',()=>{
 const live={players:{me:{casinoTask:{id:'delivery',status:'active',index:0,checkpoints:[{name:'Speak with Avery',actorId:'avery'}]}}},actors:{avery:{position:{x:-7,y:.02,z:23}}}};
 assert.equal(questMapTags(live,'me')[0].z,23);
 live.actors.avery.position.z=19;assert.equal(questMapTags(live,'me')[0].z,19);
 delete live.actors.avery;assert.deepEqual(questMapTags(live,'me'),[]);
});
