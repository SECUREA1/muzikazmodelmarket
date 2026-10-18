import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {economyItem,ownsEconomyItem} from '../game-economy.mjs';
import {createBasketballJersey,setBasketballJersey} from '../public/js/basketball-jerseys.js';

test('complete basketball gear is free for every account with usable catalog targets',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8')).assets;
  for(const id of ['basketball','basketball-hoop','basketball-jersey-home','basketball-jersey-away','basketball-arena']){
    const item=economyItem('backpack:'+id),asset=catalog.find(asset=>asset.id===id);
    assert.ok(item,id);assert.equal(item.basic,true);assert.equal(item.priceMzk,0);assert.equal(item.useCostMzk,0);
    assert.equal(ownsEconomyItem({items:[]},item),true);
    await access(new URL('..'+asset.thumbnailUrl,import.meta.url));
  }
  assert.equal(catalog.find(item=>item.id==='basketball-arena').environmentId,'basketball-arena');
  for(const team of ['home','away']){
    const jersey=catalog.find(item=>item.id==='basketball-jersey-'+team);
    assert.equal(jersey.attachment.socket,'torso');assert.equal(jersey.basketballTeam,team);
  }
});

test('jersey is a sleeveless garment that fits, swaps and removes without replacing the avatar',()=>{
  const avatar=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.3,1.2,4,12));
  body.position.y=.9;avatar.add(body);
  const label=new THREE.Sprite(new THREE.SpriteMaterial());label.scale.set(20,20,20);label.position.y=8;avatar.add(label);
  const jersey=setBasketballJersey(THREE,avatar,'home');
  assert.equal(body.parent,avatar);assert.equal(jersey.userData.attachmentSocket,'torso');
  assert.ok(jersey.getObjectByName('Jersey_Front'));assert.ok(jersey.getObjectByName('Jersey_Back'));
  const size=new THREE.Box3().setFromObject(jersey).getSize(new THREE.Vector3());
  assert.ok(size.y>.6&&size.y<.95,'labels do not affect torso fit');
  assert.ok(size.x>.5&&size.x<1);
  assert.equal(setBasketballJersey(THREE,avatar,'home'),jersey,'repeated snapshots reuse the mesh');
  let disposed=0;jersey.getObjectByName('Jersey_Front').geometry.addEventListener('dispose',()=>disposed++);
  const away=setBasketballJersey(THREE,avatar,'away');
  assert.equal(disposed,1);assert.equal(jersey.parent,null);assert.equal(away.userData.team,'away');
  setBasketballJersey(THREE,avatar,null);
  assert.equal(away.parent,null);assert.deepEqual(avatar.children,[body,label]);
});

test('uniform follows an animated chest socket and re-fits a newly loaded peer avatar',()=>{
  const root=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(.65,1.8,.45));body.position.y=.9;root.add(body);
  const fallback=setBasketballJersey(THREE,root,'home');
  body.visible=false;
  const authored=new THREE.Group(),torso=new THREE.Bone();torso.name='mixamorig:Spine2';torso.position.y=1.1;
  const skin=new THREE.Mesh(new THREE.BoxGeometry(.7,1.8,.5));skin.position.y=.9;authored.add(skin,torso);root.add(authored);root.userData.serverAvatarModel=authored;
  const attached=setBasketballJersey(THREE,root,'home');
  assert.notEqual(attached,fallback);assert.equal(fallback.parent,null);assert.equal(attached.parent,torso);
  const before=attached.getWorldPosition(new THREE.Vector3());torso.position.y+=.2;root.updateMatrixWorld(true);
  const after=attached.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(after.y-before.y-.2)<1e-6);
  assert.throws(()=>createBasketballJersey(THREE,'invalid'),/home or away/);
});
