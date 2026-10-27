import test from 'node:test';
import assert from 'node:assert/strict';
import {findPrisonPath,prisonWaypoint} from '../public/js/prison-navigation.js';
import {PRISON_WALLS,PRISON_CELLS,PRISON_NPCS,PRISON_STATIONS} from '../public/js/prison-config.js';

const station=id=>PRISON_STATIONS.find(row=>row.id===id).position;
const state=()=>({cells:{},gateOpen:false});
// Sample the whole walked route against the authored, radius-expanded physical
// obstacles, including narrow door panels and furniture, not just its endpoints.
function clearRoute(route,security,radius=.38){
 assert.ok(route?.length);
 const walls=[...PRISON_WALLS.filter(wall=>wall.y-wall.height/2<2),...PRISON_CELLS.filter(cell=>security.cells[cell.id]?.locked).map(cell=>cell.door)];
 if(!security.gateOpen)walls.push({x:0,z:109,width:18,depth:.3});
 for(let index=1;index<route.length;index++){
  const from=route[index-1],to=route[index],gap=Math.hypot(to.x-from.x,to.z-from.z);assert.ok(gap<=Math.SQRT2+.001,'route cannot jump across an obstacle');
  for(let part=0;part<=20;part++){
   const point={x:from.x+(to.x-from.x)*part/20,z:from.z+(to.z-from.z)*part/20};
   assert.ok(point.x>=-118&&point.x<=118&&point.z>=-118&&point.z<=118);
   assert.ok(!walls.some(wall=>Math.abs(point.x-wall.x)<=wall.width/2+radius&&Math.abs(point.z-wall.z)<=wall.depth/2+radius),'walked segment must clear wall, bars and furniture');
  }
 }
}

test('a prisoner exits Block B and enters the cafeteria through actual doorways',()=>{
 const security=state(),from=PRISON_NPCS.find(npc=>npc.id==='prisoner-milo').position,to=station('meal'),route=findPrisonPath(from,to,security);
 clearRoute(route,security);assert.deepEqual(route[0],from);assert.deepEqual(route.at(-1),to);
 assert.ok(route.some(point=>point.x===-23&&point.z>-37&&point.z<-23),'uses Block B east entrance');
 assert.ok(route.some(point=>point.x===23&&point.z>25&&point.z<37),'uses cafeteria west entrance');
 const next=prisonWaypoint(from,to,security);assert.ok(next&&Math.hypot(next.x-from.x,next.z-from.z)>.6);
});

test('locked cell bars seal the route in both directions and unlock immediately restores it',()=>{
 const security=state(),cell=PRISON_CELLS.find(row=>row.id==='a-n3'),hall={x:cell.position.x,y:0,z:27};
 clearRoute(findPrisonPath(hall,cell.position,security),security);
 security.cells[cell.id]={locked:true};assert.equal(findPrisonPath(hall,cell.position,security),null);assert.equal(findPrisonPath(cell.position,hall,security),null);
 security.cells[cell.id].locked=false;clearRoute(findPrisonPath(hall,cell.position,security),security);
});

test('service-gate release changes access to the finish pad without crossing perimeter walls',()=>{
 const security=state();assert.equal(findPrisonPath(station('gate'),station('escape'),security),null);
 security.gateOpen=true;clearRoute(findPrisonPath(station('gate'),station('escape'),security),security);
 security.gateOpen=false;assert.equal(prisonWaypoint(station('gate'),station('escape'),security),null);
});

test('all authored residents can reach meal, yard, workshop and recreation routines',()=>{
 const security=state();
 for(const npc of PRISON_NPCS)for(const destination of ['meal','gym','work','tv']){
  const route=findPrisonPath(npc.position,station(destination),security);
  assert.ok(route,npc.name+' can reach '+destination);
  assert.deepEqual(route.at(-1),station(destination));
 }
});

test('invalid, out-of-bounds and furniture-covered destinations cannot create unsafe routes',()=>{
 const security=state(),from=station('intake');
 for(const to of [null,{x:NaN,z:0},{x:119,z:0},{x:0,z:-119},{x:42,y:0,z:27}])assert.equal(findPrisonPath(from,to,security),null);
 assert.equal(findPrisonPath({x:Infinity,z:0},from,security),null);
 const fraction={x:-75.7,y:0,z:-30.2},to={x:42.8,y:0,z:16.3};
 clearRoute(findPrisonPath(fraction,to,security,{radius:.45}),security,.45);
});
