import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {commonsNeighborhood} from '../commons-neighborhood.mjs';
import {landscapedEnvironment,defaultStreets} from '../world-atlas.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {PLAYER_FLOOR_CLEARANCE as GAP} from '../public/js/player-floor.js';
const neighborhood=commonsNeighborhood(),environment=landscapedEnvironment('public-commons','Public Commons');
environment.streets=defaultStreets(environment.id,256);environment.builderScene.objects=neighborhood.objects;
const collision=new ServerBuilderCollision(),physical=collision.world(environment),itemRoots=new Map(physical.root.children.filter(root=>root.userData.builderObjectId).map(root=>[root.userData.builderObjectId,root]));
const near=(actual,expected,label,tolerance=2e-4)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,label+': expected '+expected+', received '+actual);
after(()=>{const resources=new Set();for(const root of [physical.root,collision.placedCache?.world?.root])root?.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)resources.add(material);});for(const resource of resources)resource.dispose?.();});
function startAt(x,z,surface){const point=collision.groundAt(environment,{x,y:surface+GAP,z},{maxRise:.05});assert.ok(point,'authored support exists at '+x+', '+z);near(point.y,surface+GAP,'starting feet');return point;}
function walkTo(previous,x,z,{surface,actors={},label='walking'}={}){
 const origin={...previous},length=Math.hypot(x-origin.x,z-origin.z),steps=Math.max(1,Math.ceil(length/.08));let position={...previous};
 for(let index=1;index<=steps;index++){
  const nextX=origin.x+(x-origin.x)*index/steps,nextZ=origin.z+(z-origin.z)*index/steps,next=collision.resolve(environment,position,{x:nextX,y:position.y-.04,z:nextZ},actors);
  near(next.x,nextX,label+' x');near(next.z,nextZ,label+' z');assert.ok(Number.isFinite(next.floorY),label+' retains physical floor support');assert.ok(next.y>=next.floorY-1e-5,label+' keeps feet above the floor');
  if(surface!==undefined)near(next.floorY,surface+GAP,label+' support height');assert.ok(!next.blockedCeiling,label+' has headroom');position=next;
 }return position;
}
test('paving forms uninterrupted walk-in routes to all four occupied buildings',()=>{
 for(const id of ['workshop','cafe','library','hall']){
  const building=neighborhood.locations.find(location=>location.id===id);assert.ok(building,id+' remains a destination');
  const side=Math.sign(building.x),pathZ=building.z+7.2;let feet=startAt(side*3.6,pathZ,.2);
  feet=walkTo(feet,building.x,pathZ,{surface:.2,label:id+' paving'});
  feet=walkTo(feet,building.x,building.z+4.8,{surface:.2,label:id+' landing'});
  feet=walkTo(feet,building.x,building.z+1.8,{surface:.2,label:id+' doorway'});
  near(feet.y,.2+GAP,id+' interior floor');assert.ok(collision.hasBodyClearance(environment,feet),id+' interior is usable');
  feet=walkTo(feet,building.x,pathZ,{surface:.2,label:id+' exit'});near(feet.z,pathZ,id+' exit reaches paving');
 }
});
test('four low stage treads climb from the promenade to a clear deck beneath all three canopies',()=>{
 let feet=startAt(-84,15.3,.2);
 for(const [z,height]of [[14.775,.25],[14.325,.3],[13.875,.35],[13.425,.4]]){
  feet=walkTo(feet,-84,z,{label:'stage stairs'});near(feet.floorY,height+GAP,'each tread supports the correct height');near(feet.y,height+GAP,'feet climb each tread');
 }
 feet=walkTo(feet,-84,12,{surface:.4,label:'stage entry'});
 for(const x of [-88.8,-84,-79.2]){feet=walkTo(feet,x,12,{surface:.4,label:'under stage canopies'});near(feet.y,.4+GAP,'stage remains level');assert.ok(collision.hasBodyClearance(environment,feet),'canopy has usable body clearance');}
});
test('water garden bridge has a solid level deck, clear lane and lower landings',()=>{
 for(const z of [48,48.45]){
  let feet=startAt(79.2,z,.2);
  for(const x of [81.6,84,86.4]){feet=walkTo(feet,x,z,{label:'water garden bridge'});near(feet.floorY,.4+GAP,'bridge deck support');near(feet.y,.4+GAP,'bridge feet');assert.ok(collision.hasBodyClearance(environment,feet),'bridge rails leave a clear lane');}
  feet=walkTo(feet,88.8,z,{label:'bridge landing'});near(feet.floorY,.2+GAP,'far landing support');near(feet.y,.2+GAP,'feet descend onto far landing');
 }
 const deck=neighborhood.objects.find(item=>item.id.includes('water-garden-bridge-')&&Math.abs(item.position.x-84)<.01&&Math.abs(item.position.z-48)<.01&&Math.abs(item.position.y-.2)<.01);
 assert.ok(deck,'the bridge centre is an ordinary solid Builder piece');const actors={[deck.id]:{active:false}};let dropped={x:84,y:.4+GAP,z:48};
 for(let tick=0;tick<12;tick++)dropped=collision.resolve(environment,dropped,{...dropped,y:dropped.y-.05},actors);
 assert.ok(Number.isFinite(dropped.floorY)&&dropped.floorY<.3&&dropped.y<.3,'removing one deck tile removes its elevated support');
 const lower=collision.groundAt(environment,{x:84,y:.2,z:48},{maxRise:.03,actors});assert.ok(lower&&lower.y<.3,'destroyed overhead deck cannot block the surviving ground query');
});
test('terrace seating rests above the paved floor and does not sink through it',()=>{
 const seats=neighborhood.objects.filter(item=>item.functionalSettings?.behavior==='seat'&&item.position.x>-96&&item.position.x<-72&&item.position.z>-56&&item.position.z<-40);
 assert.ok(seats.length>=2);
 const paving=neighborhood.objects.filter(item=>item.modelId==='material:baseplate'&&item.position.x>-96&&item.position.x<-72&&item.position.z>-56&&item.position.z<-40).map(item=>itemRoots.get(item.id)).filter(Boolean);assert.ok(paving.length);
 for(const seat of seats){const root=itemRoots.get(seat.id);assert.ok(root);near(new THREE.Box3().setFromObject(root).min.y,.2,'seat base rests above paving');const ray=new THREE.Raycaster(new THREE.Vector3(seat.position.x,.25,seat.position.z),new THREE.Vector3(0,-1,0),0,.3),hit=ray.intersectObjects(paving,true)[0];assert.ok(hit);near(hit.point.y,.2,'seat paving height');}
});
test('complete object footprints remain inside the map and paving preserves road and gateway corridors',()=>{
 for(const item of neighborhood.objects){
  const root=itemRoots.get(item.id);assert.ok(root,item.id+' has a real Builder model');const bounds=new THREE.Box3().setFromObject(root);assert.ok(!bounds.isEmpty());
  assert.ok(bounds.min.x>=-128&&bounds.max.x<=128&&bounds.min.z>=-128&&bounds.max.z<=128,item.id+' stays inside the map');
  if(item.modelId!=='material:paving-tile')continue;
  for(const roadX of [-64,0,64]){assert.ok(Math.abs(item.position.x-roadX)>2.5,item.id+' centre stays outside the five-metre road');assert.ok(bounds.max.x<roadX||bounds.min.x>roadX,item.id+' does not cross a road centreline');}
  for(const gatewayZ of [-90,-62,-34,34,62,90])assert.ok(bounds.max.z<gatewayZ||bounds.min.z>gatewayZ,item.id+' does not intrude into a gateway row');
 }
});
