import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIPPING_PORTS,SHIPPING_ROUTES,SHIPPING_LANES,SHIPPING_VESSELS} from '../public/js/shipping-config.js';
import {harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
import {shippingWorld} from '../shipping-world.mjs';

const environment=shippingWorld();
function assertWater(point,yaw,modelId,message){
 for(const vertex of watercraftFootprint(point,yaw,{modelId}))assert.equal(harborWaterAt(environment,vertex,.25),true,message+' at '+JSON.stringify(vertex));
}
function verifySegment(from,to,modelId,name){
 const length=Math.hypot(to.x-from.x,to.z-from.z);if(length<.01)return;
 const steps=Math.ceil(length/2),yaw=Math.atan2(from.x-to.x,from.z-to.z);
 for(let step=0;step<=steps;step++){const ratio=step/steps;assertWater({x:from.x+(to.x-from.x)*ratio,z:from.z+(to.z-from.z)*ratio},yaw,modelId,name);}
}

test('every authored shipping voyage clears real coastlines with the full largest hull along each segment and turn',()=>{
 const ship='shipping-tanker';
 for(const route of SHIPPING_ROUTES){
  const origin=SHIPPING_PORTS.find(port=>port.id===route.from),destination=SHIPPING_PORTS.find(port=>port.id===route.to);
  assert.ok(origin&&destination,route.id+' links actual ports');
  const points=[origin.approach,...route.waypoints,destination.approach];
  for(let index=1;index<points.length;index++)verifySegment(points[index-1],points[index],ship,route.id+' segment '+index);
  for(const [index,point]of points.entries()){
   // Alongside quays the route deliberately preserves the parallel berth
   // heading until its departure/arrival alignment point clears the pier.
   if(SHIPPING_PORTS.some(port=>Math.hypot(point.x-port.berth.x,point.z-port.berth.z)<48))continue;
   for(let heading=0;heading<48;heading++)assertWater(point,heading*Math.PI/24,ship,route.id+' manoeuvring waypoint '+index);
  }
 }
});

test('directional traffic lanes clear both coastlines for every unlocked cargo vessel',()=>{
 assert.equal(new Set(SHIPPING_LANES.map(lane=>lane.direction)).size,2);
 for(const lane of SHIPPING_LANES)for(const vessel of SHIPPING_VESSELS)for(let index=1;index<lane.points.length;index++)verifySegment(lane.points[index-1],lane.points[index],vessel.modelId,lane.id+' '+vessel.modelId+' segment '+index);
});

test('dock induction teaches a short navigated cargo voyage before the long shipping routes',()=>{
 const induction=SHIPPING_ROUTES.find(route=>route.id==='dock-induction');assert.ok(induction);
 const origin=SHIPPING_PORTS.find(port=>port.id===induction.from),destination=SHIPPING_PORTS.find(port=>port.id===induction.to);
 assert.ok(origin&&destination);
 assert.ok(induction.waypoints.some(point=>Math.hypot(point.x-origin.approach.x,point.z-origin.approach.z)>100),'induction must leave the loading berth before unloading');
 const points=[origin.approach,...induction.waypoints,destination.approach],length=points.slice(1).reduce((sum,point,index)=>sum+Math.hypot(point.x-points[index].x,point.z-points[index].z),0);
 assert.ok(length>=100&&length<1000,'a short navigated voyage teaches both loading and unloading');
 assert.ok(induction.units>=2&&induction.units%2===0,'cargo can be balanced between both sides');
 assert.ok(induction.rewardMzk>0);
 assert.ok(SHIPPING_ROUTES.some(route=>route.waypoints.some(point=>point.x>500)&&route.waypoints.some(point=>point.x< -500)),'advanced voyages still span the strait');
});
