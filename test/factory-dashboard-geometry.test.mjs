import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {factoryProvingGroundsWorld} from '../factory-testing-world.mjs';
import {PROVING_DASHBOARD_STATIONS,testingStations} from '../public/js/factory-test-config.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))if(material)resources.add(material);});for(const resource of resources)resource.dispose();}
function walk(collision,map,position,waypoints,label){
 const heights=[position.y];
 for(const [x,z]of waypoints){const distance=Math.hypot(x-position.x,z-position.z),steps=Math.ceil(distance/.2),dx=(x-position.x)/Math.max(1,steps),dz=(z-position.z)/Math.max(1,steps);for(let i=0;i<steps;i++){const next=collision.resolve(map,position,{x:position.x+dx,y:position.y,z:position.z+dz});position={x:next.x,y:Number.isFinite(next.floorY)?next.floorY:next.y,z:next.z};heights.push(position.y);}assert.ok(Math.hypot(position.x-x,position.z-z)<.16,label+' reaches '+x+','+z+'; actual '+position.x+','+position.z);}
 return {position,heights};
}
const originals=['proving-setup','proving-pad','proving-control','proving-hatch'];

test('three public VR dashboards retain native setup and control roles, local markers and committed map metadata',()=>{
 const map=factoryProvingGroundsWorld(),registry=JSON.parse(readFileSync(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 assert.deepEqual(registry.find(row=>row.id===map.id),map,'the live registry exposes the same raised dashboards as the authored map');
 assert.deepEqual(PROVING_DASHBOARD_STATIONS.map(station=>[station.id,station.kind,station.testingDashboard]),[['proving-vr-setup','setup','setup'],['proving-vr-launch','control','launch'],['proving-vr-telemetry','control','telemetry']]);
 const stations=testingStations(map);
 for(const expected of PROVING_DASHBOARD_STATIONS){
  const object=map.builderScene.objects.find(value=>value.id===expected.id),station=stations.find(value=>value.objectId===expected.id),marker=map.builderScene.layoutMeta.locations.find(value=>value.id===expected.id);
  assert.ok(object,expected.id+' is an independently placed item');assert.ok(station,expected.id+' resolves as a native testing station');
  assert.equal(object.functionalSettings.testingStation,expected.kind);assert.equal(object.functionalSettings.testingStationId,expected.id);assert.equal(object.functionalSettings.testingDashboard,expected.testingDashboard);
  assert.equal(station.kind,expected.kind);assert.equal(station.testingDashboard,expected.testingDashboard);assert.deepEqual(station.position,expected.position);
  assert.ok(station.interactionDistance>=4&&station.interactionDistance<=8);assert.equal(object.functionalSettings.behavior,'interact');
  assert.equal(marker.testingDashboard,expected.testingDashboard);assert.equal(marker.x,expected.position.x);assert.equal(marker.z,expected.position.z);assert.equal(marker.y,expected.position.y);
 }
 for(const id of originals)assert.ok(stations.some(station=>station.objectId===id),id+' remains available alongside the new dashboards');
});

test('raised dashboard markers stand on their actual decks with clear operator space',()=>{
 const map=factoryProvingGroundsWorld(),collision=new ServerBuilderCollision();
 for(const station of PROVING_DASHBOARD_STATIONS){
  const floor=collision.groundAt(map,station.position,{entry:true});assert.ok(floor,station.id+' has a physical deck');
  assert.ok(Math.abs(floor.y-station.position.y)<.012,station.id+' matches its raised walking level (actual '+floor.y+')');
  assert.ok(collision.hasBodyClearance(map,floor,.38),station.id+' leaves player clearance at the operator marker');
  // The south stairs begin beyond the edge of the raised deck, on ground level.
  const front=station.position.z+station.deck.depth/2,ground=collision.groundAt(map,{x:station.position.x,y:.02,z:front+10},{entry:true});
  assert.ok(ground&&ground.y<.06,station.id+' stairs connect to the main ground floor');
 }
 dispose(collision.world(map).root);
});

test('players climb and descend every dashboard through the south stairs without teleporting or jumping',()=>{
 const map=factoryProvingGroundsWorld(),collision=new ServerBuilderCollision();
 for(const station of PROVING_DASHBOARD_STATIONS){
  const x=station.position.x,z=station.position.z,front=z+station.deck.depth/2,start=collision.groundAt(map,{x,y:.02,z:front+10},{entry:true});assert.ok(start);
  const up=walk(collision,map,{...start},[[x,z]],station.id+' climb');
  assert.ok(Math.abs(up.position.y-station.position.y)<.012,station.id+' reaches the operator deck');
  assert.ok(up.heights.some(y=>y>.1&&y<station.deck.height-.05),station.id+' crosses intermediate stair levels');
  const down=walk(collision,map,up.position,[[x,front+10]],station.id+' descent');assert.ok(down.position.y<.06,station.id+' returns to ground level');
  for(const heights of [up.heights,down.heights])for(let i=1;i<heights.length;i++)assert.ok(Math.abs(heights[i]-heights[i-1])<.22,station.id+' uses individual low steps instead of one abrupt platform jump');
 }
 dispose(collision.world(map).root);
});

test('original preparation point, bunker controls, launch pad and mountain hatch remain reachable',()=>{
 const map=factoryProvingGroundsWorld(),collision=new ServerBuilderCollision(),stations=testingStations(map),originalStations=originals.map(id=>stations.find(station=>station.objectId===id));
 for(const station of originalStations){assert.ok(station);const floor=collision.groundAt(map,station.position,{entry:true});assert.ok(floor&&collision.hasBodyClearance(map,floor,.38),station.objectId+' still has clear floor');}
 let position=collision.safeSpawn(map,map.spawn);
 for(const [label,path]of [['preparation',[[-42,35]]],['control bunker',[[-24,35],[-24,18]]],['launch pad',[[-24,30],[0,30],[0,-10]]],['mountain hatch',[[0,35],[50,35],[50,25]]]])position=walk(collision,map,position,path,label).position;
 dispose(collision.world(map).root);
});
