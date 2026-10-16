import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {overheadBuildView} from '../public/js/builder-view.js';
test('overhead reset fits every map corner on portrait and desktop screens',()=>{
 for(const size of [40,80,120,160,240,320])for(const aspect of [.35,.6,1,1.55,2.4]){
  const {height,offset,distance}=overheadBuildView(size,aspect,48);
  const length=Math.hypot(height,offset),sin=offset/length,cos=height/length;
  for(const x of [-size/2,size/2])for(const z of [-size/2,size/2]){
   const depth=length-z*sin;
   assert.ok(Math.abs(x)<depth*Math.tan(24*Math.PI/180)*aspect);
   assert.ok(Math.abs(z*cos)<depth*Math.tan(24*Math.PI/180));
  }
  assert.ok(distance>=height);
 }
});
test('layout entry uses one dispatch and district terrain matches runtime flat floors',()=>{
 const source=readFileSync(new URL('../environment-builder.js',import.meta.url),'utf8');
 assert.ok(source.includes('function selectLayout(layout)'));
 assert.ok(source.includes('if(URBAN_LAYOUTS[layout]||BUILDING_DISTRICTS[layout])return 0'));
 assert.ok(source.includes('if(URBAN_LAYOUTS[id]||BUILDING_DISTRICTS[id]){worldDressing'));
 assert.ok(!source.includes('sceneData.layout=requested'));
 assert.ok(source.includes("$('#reset-build-view').addEventListener('click',resetBuildView)"));
});
