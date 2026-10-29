import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createConstructionScene} from '../public/js/construction-scene.js';
import {QUARRY_MATERIALS} from '../public/js/quarry-config.js';
const keys=Object.keys(QUARRY_MATERIALS);
const patch=(id,key,columns=2)=>({id,origin:{x:10,z:20},cellSize:2,columns,rows:columns,baseY:0,minY:0,heights:Array(columns*columns).fill(1),soil:Array(columns*columns).fill(0),gravel:Array(columns*columns).fill(key==='gravel'?4:0),...(key==='gravel'?{}:{products:{[key]:Array(columns*columns).fill(4)}})});
const snapshot=(patches,revision=1)=>({construction:{tower:null,earthworks:{revision,patches},crew:{workers:[]}},actors:{}});
const all=(root,test)=>{const nodes=[];root.traverse(node=>{if(test(node))nodes.push(node);});return nodes;};
const colorAt=(mesh,index=0)=>{const color=new THREE.Color();mesh.getColorAt(index,color);return color.getHex();};
test('real coarse products use bounded colored surface grains and fine products keep their terrain surface',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),patches=['gravel',...keys].map(key=>patch('product-'+key,key,16)),state=snapshot(patches),saved=structuredClone(state);view.update(state);
 const grains=all(view.root,node=>node.userData.quarryAggregate);assert.equal(grains.length,3,'only gravel, sorted stone and crushed aggregate get visible coarse grains');
 for(const mesh of grains){const key=mesh.userData.materialTypes[0];assert.ok(['gravel','stone','crushed'].includes(key));assert.equal(mesh.isInstancedMesh,true);assert.ok(mesh.count>0&&mesh.count<=240);assert.equal(mesh.userData.collisionDisabled,true);assert.equal(colorAt(mesh),QUARRY_MATERIALS[key]?.color??0x92948b);}
 assert.equal(view.groundMeshes.length,7);assert.ok(view.groundMeshes.every(mesh=>!mesh.userData.quarryAggregate),'surface details never replace the real walking terrain');assert.deepEqual(state,saved);view.dispose();
});
test('earth movement dust retains the removed material color even when its final cell becomes empty',()=>{
 for(const key of keys){const view=createConstructionScene(THREE,new THREE.Scene()),p=patch('product-'+key,key,1);view.update(snapshot([p]));const empty=structuredClone(p);empty.heights[0]=0;empty.products[key][0]=0;view.update(snapshot([empty],2));view.animate(1);const dust=view.root.getObjectByName('EARTH_MOVEMENT_PARTICLES');assert.equal(dust.count,1,key);assert.equal(colorAt(dust),QUARRY_MATERIALS[key].color,key+' dust follows actual material, not generic brown');view.reset();assert.equal(dust.count,0);view.dispose();}
});
test('six real stockpiles and three plants receive current labels without labelling every conveyor',()=>{
 const view=createConstructionScene(THREE,new THREE.Scene()),patches=keys.map(key=>patch('product-'+key,key)),state=snapshot(patches);state.quarry={stockpiles:Object.fromEntries(keys.map(key=>[key,{volume:12.5,buffer:2.25}])),stations:{}};
 for(const kind of ['screener','crusher','stacker']){state.actors[kind]={id:kind,active:true,position:{x:20,y:4,z:30},quarryMachine:{kind}};state.quarry.stations[kind]={throughput:1.25,status:'Processing real material'};}
 for(let i=0;i<13;i++)state.actors['link-'+i]={id:'link-'+i,position:{x:i,y:0,z:0},quarryMachine:{kind:'conveyor'}};view.update(state);
 const labels=all(view.root,node=>node.userData.worldLabel);assert.equal(labels.length,9);for(const key of keys){const tag=view.root.getObjectByName('QUARRY_STOCKPILE_LABEL_'+key);assert.equal(tag.userData.title,QUARRY_MATERIALS[key].name);assert.equal(tag.userData.detail,'12.5 m³ loose · 2.3 m³ in plant');assert.equal(tag.userData.caption,'Book stock for Trading Market');assert.ok(tag.position.y>1);}
 const tag=view.root.getObjectByName('QUARRY_STOCKPILE_LABEL_sand'),material=tag.material;let disposed=0;material.addEventListener('dispose',()=>disposed++);state.quarry.stockpiles.sand.volume=7;view.update(state);assert.equal(view.root.getObjectByName(tag.name),tag,'ordinary updates reuse the label and texture');assert.equal(tag.userData.detail,'7.0 m³ loose · 2.3 m³ in plant');assert.match(view.root.getObjectByName('QUARRY_PLANT_LABEL_crusher').userData.detail,/1.25 m³\/s/);
 view.reset();assert.equal(disposed,1);assert.equal(all(view.root,node=>node.userData.worldLabel).length,0);assert.equal(view.root.visible,false);view.update(snapshot([patches[0]]));assert.equal(all(view.root,node=>node.userData.worldLabel).length,0,'ordinary construction does not inherit quarry markers');view.dispose();
});
test('quarry labels clear when a snapshot switches directly to ordinary construction',()=>{
 const view=createConstructionScene(THREE,new THREE.Scene()),p=patch('product-sand','sand'),state=snapshot([p]);state.quarry={stockpiles:{sand:{volume:4,buffer:0}}};view.update(state);assert.ok(view.root.getObjectByName('QUARRY_STOCKPILE_LABEL_sand'));delete state.quarry;view.update(state);assert.equal(view.root.getObjectByName('QUARRY_STOCKPILE_LABEL_sand'),undefined);view.dispose();
});
