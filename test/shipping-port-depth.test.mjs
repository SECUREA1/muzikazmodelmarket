import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {shippingWorld} from '../shipping-world.mjs';
import {SHIPPING_PORTS} from '../public/js/shipping-config.js';
import {shippingCommercialTerminals} from '../public/js/shipping-port-config.js';
import {shippingPortSceneState,createShippingPortScene} from '../public/js/shipping-port-scene.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {watercraftFootprint,harborWaterAt} from '../public/js/harbor-water.js';

test('commercial dock wings connect warehouses to land while retaining public and commercial tanker turning clearance',()=>{
 const environment=shippingWorld(),collision=new ServerBuilderCollision(),tanker={modelId:'shipping-tanker'};
 for(const terminal of shippingCommercialTerminals()){
  const port=SHIPPING_PORTS.find(port=>port.id===terminal.portId);
  for(const target of [terminal.berth,terminal.berth.entry,port.entry,{x:port.x+146.5,z:port.z},{x:port.x-146.5,z:port.z}])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8)assert.ok(watercraftFootprint(target,angle,tanker).every(point=>harborWaterAt(environment,point,.25)),terminal.portId+' preserves room for a turning tanker');
  const points=[terminal.supervisor,terminal.dispatch,{x:terminal.spine.x,z:terminal.spine.z}];
  for(const point of points){const floor=collision.groundAt(environment,{...point,y:1});assert.ok(floor&&floor.y>=0,terminal.portId+' connected work area has real floor');}
  const places=environment.builderScene.layoutMeta.locations.filter(place=>place.id===terminal.portId+'-warehouse'||place.id===terminal.portId+'-commercial-dispatch');assert.equal(places.length,2);
  for(const place of places){const floor=collision.meetingPosition(environment,place.arrival);assert.ok(Math.hypot(floor.x-place.arrival.x,floor.z-place.arrival.z)<3);assert.ok(collision.hasBodyClearance(environment,floor,.38));}
 }
});

const context=()=>({fillRect(){},fillText(){}});
const canvas=()=>({getContext:()=>context(),width:0,height:0});
const fixture=()=>{
 const berth=shippingCommercialTerminals()[0].berth;
 return {shipping:{enabled:true,environmentId:'hormuz-shipping',rivals:[{id:'gulf-link',companyName:'Gulf Link Logistics',shipId:'rival-ship',phase:'loading',job:{originId:'jebel-ali',destinationId:'qeshm'},lastTransfer:{kind:'load',at:1000,endsAt:3000,side:'port',unitIndex:0}}],portEconomy:[{portId:'jebel-ali',stock:{provisions:80},imports:2,exports:1,unloaded:8,loaded:4}]},sequence:5,serverTime:1500,actors:{'rival-ship':{id:'rival-ship',modelId:'shipping-feeder',position:{...berth,y:0},rotation:{y:berth.yaw}}},players:{}};
};
test('port cranes project confirmed lift timing, stock and company activity with bounded shared scene resources',()=>{
 const environment={id:'hormuz-shipping'},scene=new THREE.Scene(),projection=createShippingPortScene(scene,{createCanvas:canvas}),snapshot=fixture();
 projection.update(snapshot,'alice',environment);const first=projection.snapshot();assert.equal(first.enabled,true);assert.equal(first.activeTransfers.length,1);assert.equal(first.stockCrates,4);assert.equal(first.activeTransfers[0].companyId,'gulf-link');
 let renderables=0;projection.root.traverse(node=>{if(node.isMesh)renderables++;});assert.ok(renderables<60,'six commercial ports use shared instanced scenery');
 const data=shippingPortSceneState(snapshot,'alice',environment)[0];assert.equal(data.arrivals,2);assert.equal(data.departures,1);assert.equal(data.receivedUnits,8);
 projection.animate(.5);const second=projection.snapshot();assert.notEqual(second.activeTransfers[0].hook.z,first.activeTransfers[0].hook.z,'a confirmed load moves from the actual yard toward the vessel');
 const stale=fixture();stale.sequence=4;stale.serverTime=1000;stale.shipping.rivals=[];projection.update(stale,'alice',environment);assert.equal(projection.snapshot().sequence,5);assert.equal(projection.snapshot().activeTransfers.length,1);
 projection.animate(10);assert.equal(projection.snapshot().activeTransfers.length,1,'projection caps rendering extrapolation during an absent server update');
 const securing=fixture();securing.sequence=6;securing.serverTime=2500;securing.shipping.rivals[0].phase='securing';projection.update(securing,'alice',environment);assert.equal(projection.snapshot().activeTransfers.length,1,'the final confirmed container finishes lifting while the crew secures the manifest');
 const done=fixture();done.sequence=6;done.serverTime=4000;done.shipping.rivals[0].phase='sailing';projection.update(done,'alice',environment);assert.equal(projection.snapshot().activeTransfers.length,0);
 const waiting=fixture();waiting.sequence=7;waiting.serverTime=5000;delete waiting.shipping.rivals[0].lastTransfer;waiting.shipping.rivals[0].workStartedAt=4000;waiting.shipping.rivals[0].nextWorkAt=6000;projection.update(waiting,'alice',environment);assert.equal(projection.snapshot().activeTransfers.length,0,'waiting for a first server lift does not invent a container transfer');
 projection.update(done,'alice',{id:'neon-harbor'});assert.equal(projection.snapshot().enabled,false);
 let disposed=0;projection.root.traverse(node=>{if(node.isInstancedMesh)node.addEventListener('dispose',()=>disposed++);});projection.dispose();assert.equal(scene.children.length,0);assert.ok(disposed>=4);projection.dispose();
});
