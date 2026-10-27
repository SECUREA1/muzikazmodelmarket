import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createCasinoLand} from '../public/js/environments/casino-land.js';
import {casinoWorld} from '../casino-world.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))if(material){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();}
function walk(collision,world,points){let previous={x:points[0][0],y:.02,z:points[0][1]};for(const [x,z]of points.slice(1)){const from={...previous},span=Math.hypot(x-from.x,z-from.z),count=Math.max(1,Math.ceil(span/.15));for(let i=1;i<=count;i++){const next={x:from.x+(x-from.x)*i/count,y:.02,z:from.z+(z-from.z)*i/count},resolved=collision.resolve(world,previous,next);assert.ok(Math.hypot(resolved.x-next.x,resolved.z-next.z)<.025,`clear walk to ${x},${z} blocked near ${previous.x},${previous.z}`);previous=resolved;}}return previous;}

test('premium casino adds two native game tables and furnished rooms within the existing map and render budget',()=>{
 const root=createCasinoLand();try{const bounds=new T.Box3().setFromObject(root);assert.equal(bounds.min.x,-40);assert.equal(bounds.max.x,40);assert.equal(bounds.min.z,-40);assert.equal(bounds.max.z,40);assert.ok(root.getObjectByName('BUILDER_WALKABLE_FLOOR_casino'));let triangles=0;root.traverse(node=>{if(node.isMesh)triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;});assert.ok(triangles<100000,`${triangles} triangles`);for(const [id,x,z]of [['casino-baccarat-vip',29,-31],['casino-threecard-salon',-18,-33]]){const table=root.userData.casinoStations.get(id);assert.ok(table,id);assert.deepEqual([table.position.x,table.position.z],[x,z]);assert.ok(table.getObjectByName('CASINO_PREMIUM_FELT_INLAY'));}for(const name of ['CASINO_STAFF_LOCKER','CASINO_STAFF_PREP_COUNTER','CASINO_STAFF_RESTOCK_CRATE','CASINO_SOCIAL_BOOTH_SCREEN'])assert.ok(root.getObjectByName(name),name);assert.equal(root.userData.casinoRooms.staff.locked,false);}finally{dispose(root);}
});

test('premium room entries, dealer ingress and staff work areas remain physically reachable',()=>{
 const world=casinoWorld(),collision=new ServerBuilderCollision();
 walk(collision,world,[[20,-16],[20,-21],[35,-21],[35,-35],[29,-35],[29,-34]]);
 walk(collision,world,[[10,-22],[13.5,-22],[17,-29],[17,-32]]);
 walk(collision,world,[[-7,-19],[-13,-19],[-13,-28],[-18,-29.3]]);
 walk(collision,world,[[-27,-23],[-32,-23],[-32,-27],[-32,-32],[-33,-28]]);
 for(const [x,z]of [[29,-27.3],[25,-31],[33,-31],[-18,-29.3],[-22,-33],[-14,-33],[-18,-36],[-32,-25],[-32,-27],[-32,-32],[-33,-28]]){const point={x,y:.02,z};assert.ok(collision.groundAt(world,point),`${x},${z} has floor`);assert.ok(collision.hasBodyClearance(world,point,.7),`${x},${z} has standing clearance`);}
 assert.equal(collision.hasBodyClearance(world,{x:12,y:.02,z:-32},.38),false,'VIP room wall is solid');assert.equal(collision.hasBodyClearance(world,{x:-28.55,y:.02,z:-25},.38),false,'staff room front wall is solid');
 let p={x:0,y:.02,z:-20};for(let i=0;i<30;i++)p=collision.resolve(world,p,{...p,z:p.z-.2});assert.ok(p.z>-22.5,'vault stays locked');
});

test('advanced table surfaces show public server hands, hide redacted dealer cards and settle without extra cards',()=>{
 const root=createCasinoLand();try{const show=root.userData.animateCasinoStation,three=root.userData.casinoStations.get('casino-threecard-salon'),baccarat=root.userData.casinoStations.get('casino-baccarat-vip');show('casino-threecard-salon',{game:'threecard',phase:'playing',hand:[0,13,26],dealerHand:[null,null,null]});assert.deepEqual(three.userData.casinoHandCards.map(card=>card.userData.casinoCardValue),[0,13,26]);assert.ok(three.userData.casinoDealerCards.every(card=>card.userData.casinoCardFaceDown));show('casino-threecard-salon',{game:'threecard',phase:'complete',hand:[0,13,26],dealerHand:[12,25,38],payoutMzk:80});assert.deepEqual(three.userData.casinoDealerCards.map(card=>card.userData.casinoCardValue),[12,25,38]);assert.equal(three.userData.casinoDealingCard.visible,false);show('casino-baccarat-vip',{game:'baccarat',phase:'complete',hand:[1,6],dealerHand:[11,14,19],payoutMzk:200});assert.equal(baccarat.userData.casinoHandCards.filter(card=>card.visible).length,2);assert.deepEqual(baccarat.userData.casinoDealerCards.map(card=>card.userData.casinoCardValue),[11,14,19]);root.userData.updateCasinoEffects(5,true);assert.equal(baccarat.userData.casinoDealingCard.visible,false);}finally{dispose(root);}
});
