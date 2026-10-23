import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {restoreResidentContinuity,saveResidentContinuity} from '../server-resident-progress.mjs';

const actor='account:alice';
const person=(extra={})=>({actorId:actor,username:'Alice',health:100,score:7,tokens:{MZK:431},...extra});
const contact=(activity,lastAt=100)=>({visits:2,affinity:6,preferences:{activity},turns:[{text:'I like '+activity,intent:'preference',at:lastAt}],topic:'preference',lastAt});
const room=player=>({simulation:{players:{[actor]:player}}});
const checkpoint=(player,mapId,now)=>saveResidentContinuity(player,mapId,now);

test('portable resident progress follows the latest server revision across saved maps without counting cloned XP twice',()=>{
 const garden=person({residentSocial:{'garden|host':contact('music')},residentPreferences:{interest:'music',pace:'slowly'},residentProgress:{reputation:8,skills:{hospitality:12},completedTasks:1,cosmetics:['Guide badge'],completedKeys:['garden|host|1']}}),rooms={garden:room(garden)};
 checkpoint(garden,'garden',100);
 const marina=person();rooms.marina=room(marina);
 restoreResidentContinuity(marina,rooms,actor,'marina',200);checkpoint(marina,'marina',200);
 assert.equal(marina.residentPreferences.interest,'music');assert.equal(marina.residentProgress.skills.hospitality,12);
 marina.residentProgress.skills.hospitality+=16;marina.residentProgress.reputation+=10;marina.residentProgress.completedTasks++;
 marina.residentSocial['marina|host']=contact('sailing',250);checkpoint(marina,'marina',250);
 restoreResidentContinuity(garden,rooms,actor,'garden',300);checkpoint(garden,'garden',300);
 assert.equal(garden.residentProgress.skills.hospitality,28);assert.equal(garden.residentProgress.reputation,18);assert.equal(garden.residentProgress.completedTasks,2);
 assert.equal(garden.residentSocial['garden|host'].preferences.activity,'music');assert.equal(garden.residentSocial['marina|host'].preferences.activity,'sailing','identical local NPC IDs remain qualified by map');
 garden.residentProgress.skills.hospitality+=12;checkpoint(garden,'garden',350);
 restoreResidentContinuity(marina,rooms,actor,'marina',400);
 assert.equal(marina.residentProgress.skills.hospitality,40,'successive favors add to the newest counter rather than maxima or sum of replicas');
 assert.deepEqual(marina.tokens,{MZK:431});assert.equal(marina.score,7);
});

test('same-room reconnect keeps current progress while stale copies and another account cannot replace its memories',()=>{
 const current=person({residentSocial:{'custom-room|host':contact('design',500)},residentProgress:{reputation:10,skills:{social:14},completedTasks:1}});
 checkpoint(current,'custom-room',500);
 const stale=structuredClone(current);stale.residentProgress.skills.social=0;stale.residentSocial['custom-room|host']=contact('old topic',100);
 current.residentProgress.skills.social=28;current.residentProgress.completedTasks=2;checkpoint(current,'custom-room',600);
 const bob=person({actorId:'account:bob',residentSocial:{'custom-room|host':contact('private Bob preference',1000)},residentProgress:{skills:{social:99999}}});checkpoint(bob,'custom-room',1000);
 const rooms={'custom-room':room(current),old:room(stale),bob:{simulation:{players:{'account:bob':bob}}}};
 restoreResidentContinuity(current,rooms,actor,'custom-room',700);
 assert.equal(current.residentProgress.skills.social,28);assert.equal(current.residentSocial['custom-room|host'].preferences.activity,'design');
 assert.ok(!JSON.stringify(current.residentContinuity).includes('Bob'));
});

test('legacy room saves migrate map-qualified conversations and casino preferences without moving tasks or wallet state',()=>{
 const old=person({residentSocial:{guide:contact('skiing',200)},residentProgress:{reputation:8,skills:{social:12},completedTasks:1},residentTask:{status:'active',id:'old-favor'},casinoProgress:{skills:{poker:2}},casinoSocial:{dealer:{...contact('',250),preferences:{game:'poker'}}}});
 const target=person({position:{x:2,y:0,z:3},inventory:['camera'],residentTask:{id:'local-favor',status:'active'},residentProgress:{skills:{social:8}}});
 restoreResidentContinuity(target,{'old-ski-map':room(old),'new-custom-map':room(target)},actor,'new-custom-map',300);
 assert.equal(target.residentSocial['old-ski-map|guide'].preferences.activity,'skiing');assert.equal(target.residentPreferences.interest,'skiing');assert.equal(target.residentProgress.skills.social,12);
 assert.deepEqual(target.residentTask,{id:'local-favor',status:'active'},'only the local task survives, never an active task from a different map');assert.deepEqual(target.position,{x:2,y:0,z:3});assert.deepEqual(target.inventory,['camera']);assert.equal(target.casinoProgress,undefined);
 checkpoint(target,'new-custom-map',300);
 const casino=person();restoreResidentContinuity(casino,{'old-ski-map':room(old),'new-custom-map':room(target)},actor,'muzikaz-casino',400);
 assert.equal(casino.casinoSocial.dealer.preferences.game,'poker');assert.equal(casino.residentTask,undefined);assert.equal(casino.score,7);assert.deepEqual(casino.tokens,{MZK:431});
 const forged=person({residentContinuity:{...target.residentContinuity,actorId:'account:bob',revision:999,progress:{reputation:1e9}}});
 restoreResidentContinuity(forged,{},actor,'fresh-map',500);assert.equal(forged.residentProgress.reputation,0,'a portable bundle for another account is ignored');
});

test('saved Builder worlds retain portable conversations and progress through flush and server restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'resident-saves-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'rooms.json'),store=new SharedRoomStore(file);
 await store.update('saved-builder',saved=>{saved.simulation={players:{[actor]:person({residentSocial:{'saved-builder|local':contact('art',1000)},residentPreferences:{interest:'art'},residentProgress:{reputation:9,skills:{social:14},completedTasks:1,completedKeys:['saved-builder|local|day-1']}})}};checkpoint(saved.simulation.players[actor],'saved-builder',1000);});
 await store.update('saved-builder',saved=>{const p=saved.simulation.players[actor];p.residentSocial['saved-builder|local'].visits++;p.residentSocial['saved-builder|local'].lastAt=1100;checkpoint(p,'saved-builder',1100);},{persist:false,roomOnly:true});
 await store.flush();
 const restarted=new SharedRoomStore(file),all=await restarted.read(),visitor=person();
 restoreResidentContinuity(visitor,all,actor,'another-saved-map',1200);
 assert.equal(visitor.residentSocial['saved-builder|local'].visits,3);assert.equal(visitor.residentPreferences.interest,'art');assert.equal(visitor.residentProgress.skills.social,14);assert.deepEqual(visitor.residentProgress.completedKeys,['saved-builder|local|day-1']);
 assert.equal(visitor.residentTask,undefined);assert.equal(visitor.npcConversation,undefined);
 // Client-writable Backpack memory is not supplied to either restoration hook.
 all.fakeBackpack={memory:{residentContinuity:{actorId:actor,revision:999,progress:{reputation:999999}}}};
 restoreResidentContinuity(visitor,all,actor,'another-saved-map',1300);assert.equal(visitor.residentProgress.reputation,9);
});

test('portable social histories stay bounded and returning maps recover their retained local contacts first',()=>{
 const p=person({residentSocial:{},residentPreferences:{interest:'music'}});
 for(let map=0;map<4;map++){
  p.residentSocial=Object.fromEntries(Array.from({length:22},(_,i)=>['map-'+map+'|npc-'+i,{...contact('music',map*100+i),turns:Array.from({length:20},(_,j)=>({text:'x'.repeat(500),intent:'question',at:j}))}]));
  checkpoint(p,'map-'+map,1000+map);
 }
 assert.equal(Object.keys(p.residentContinuity.contacts).length,64);
 const restored=person();restoreResidentContinuity(restored,{last:room(p)},actor,'map-1',2000);
 assert.equal(Object.keys(restored.residentSocial).length,32);
 const local=Object.keys(restored.residentSocial).filter(key=>key.startsWith('map-1|'));assert.equal(local.length,20,'retained older local contacts take priority over newer contacts from other maps');
 for(const value of Object.values(restored.residentSocial)){assert.equal(value.turns.length,6);assert.ok(value.turns.every(turn=>turn.text.length<=180));}
 const encoded=JSON.stringify(restored.residentContinuity);assert.ok(encoded.length<100000);
});

test('an explicitly stated casino preference travels to new worlds without an old casino memory overriding a later interest',()=>{
 const p=person({residentPreferences:{interest:'design'}});checkpoint(p,'studio',1000);
 p.casinoSocial={dealer:{...contact('',1100),preferences:{game:'poker'},topic:'preference'}};checkpoint(p,'muzikaz-casino',1100);
 assert.equal(p.residentPreferences.interest,'poker');
 p.residentPreferences.interest='sailing';checkpoint(p,'marina',1200);checkpoint(p,'muzikaz-casino',1300);
 assert.equal(p.residentPreferences.interest,'sailing','merely returning to the casino does not restate an old preference');
});

test('map-specific camelCase skills survive saved-world restoration with finite values and bounded skill records',()=>{
 const p=person({residentProgress:{skills:{rangeSafety:16,hospitality:12,'not valid':999,invalidValue:Infinity,...Object.fromEntries(Array.from({length:40},(_,i)=>['activity'+i,i]))}}});
 checkpoint(p,'training-range',1000);
 const restored=person();restoreResidentContinuity(restored,{range:room(p)},actor,'saved-training-room',1100);
 assert.equal(restored.residentProgress.skills.rangeSafety,16);assert.equal(restored.residentProgress.skills.hospitality,12);
 assert.equal(restored.residentProgress.skills.invalidValue,0);assert.equal(restored.residentProgress.skills['not valid'],undefined);
 assert.equal(Object.keys(restored.residentProgress.skills).length,32);assert.ok(Object.values(restored.residentProgress.skills).every(Number.isFinite));
});

test('real epoch timestamps preserve newer contacts and resolve equal-revision saves without reviving an old preference',()=>{
 const now=Date.now(),old=person({lastSeen:now-4000,residentSocial:{'garden|host':contact('old topic',now-4000)},residentProgress:{skills:{social:12}}});
 checkpoint(old,'garden',now-4000);
 const newer=person({lastSeen:now,residentSocial:{'garden|host':contact('new topic',now)},residentProgress:{skills:{social:28}}});
 checkpoint(newer,'marina',now);
 const restored=person();restoreResidentContinuity(restored,{old:room(old),newer:room(newer)},actor,'garden',now+1000);
 assert.equal(restored.residentProgress.skills.social,28,'newer wall-clock time resolves independently migrated saves with the same revision');
 assert.equal(restored.residentSocial['garden|host'].preferences.activity,'new topic');
 const uncatalogued=person({residentSocial:{'garden|host':contact('newer unsnapshotted exchange',now+100)}});
 const merged=person();restoreResidentContinuity(merged,{uncatalogued:room(uncatalogued),stale:room(old)},actor,'garden',now+200);
 assert.equal(merged.residentSocial['garden|host'].preferences.activity,'newer unsnapshotted exchange','an older saved bundle cannot override a newer migrated contact');
 const legacy=person();restoreResidentContinuity(legacy,{newer:room(person({lastSeen:now,residentPreferences:{interest:'sailing'}})),older:room(person({lastSeen:now-1000,residentPreferences:{interest:'skiing'}}))},actor,'garden',now+1000);
 assert.equal(legacy.residentPreferences.interest,'sailing');
 const casino=person({residentPreferences:{interest:'sailing'}});checkpoint(casino,'marina',now);
 casino.casinoSocial={dealer:{...contact('',now-4000),preferences:{game:'poker'},topic:'preference'}};checkpoint(casino,'muzikaz-casino',now+1000);
 assert.equal(casino.residentPreferences.interest,'sailing','returning to an old casino preference does not restate it at epoch-scale times');
});
