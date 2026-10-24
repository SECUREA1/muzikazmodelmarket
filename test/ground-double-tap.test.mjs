import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {bindGroundDoubleTap,groundPointFromPointer} from '../public/js/ground-double-tap.js';

function fixture(){
 const surface=new EventTarget(),host=new EventTarget();surface.ownerDocument={defaultView:host};let time=0,ready=true;const taps=[];
 const dispose=bindGroundDoubleTap(surface,{enabled:()=>ready,onDoubleTap:event=>taps.push([event.clientX,event.clientY]),now:()=>time});
 const send=(type,fields={},target=surface)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:40,clientY:70,...fields});target.dispatchEvent(event);return event;};
 const tap=(fields={})=>{send('pointerdown',fields);time+=50;send('pointerup',fields);time+=100;};
 return {surface,host,taps,send,tap,dispose,advance:value=>time+=value,setReady:value=>ready=value};
}

test('two precise mouse, touch or pen taps relocate exactly once',()=>{
 for(const pointerType of ['mouse','touch','pen']){
  const f=fixture();f.tap({pointerType});assert.deepEqual(f.taps,[]);f.tap({pointerType});assert.deepEqual(f.taps,[[40,70]]);
  f.send('dblclick');assert.equal(f.taps.length,1,'compatibility dblclick cannot repeat relocation');f.dispose();
 }
});

test('dragging, multitouch, hold, cancelled touches and outside controls do not become travel',()=>{
 for(const interrupt of [
  f=>{f.send('pointerdown');f.send('pointermove',{clientX:80});f.send('pointermove');f.send('pointerup');},
  f=>{f.send('pointerdown');f.send('pointerdown',{pointerId:2,isPrimary:false});f.send('pointerup');},
  f=>{f.send('pointerdown');f.advance(500);f.send('pointerup');},
  f=>{f.send('pointerdown');f.send('pointercancel');f.send('pointerup');},
  f=>f.send('pointerdown',{},f.host),
  f=>{f.setReady(false);f.tap();f.setReady(true);},
  f=>f.advance(1000),
  f=>f.tap({clientX:90}),
 ]){
  const f=fixture();f.tap();interrupt(f);f.tap();assert.deepEqual(f.taps,[]);f.dispose();
 }
});

test('automatic pointer capture release preserves the first completed tap',()=>{
 const f=fixture();f.tap();f.send('lostpointercapture');f.tap();assert.equal(f.taps.length,1);f.dispose();f.tap();f.tap();assert.equal(f.taps.length,1);
});

test('a second finger can explicitly release controls while another finger remains held',()=>{
 const surface=new EventTarget(),taps=[];let time=0;
 const dispose=bindGroundDoubleTap(surface,{allowNonPrimary:true,onDoubleTap:event=>taps.push(event.isPrimary),now:()=>time});
 for(let tap=0;tap<2;tap++){
  for(const type of ['pointerdown','pointerup']){
   const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:2,pointerType:'touch',isPrimary:false,button:0,clientX:40,clientY:70});surface.dispatchEvent(event);time+=30;
  }
  time+=60;
 }
 assert.deepEqual(taps,[false]);dispose();
});

test('a held canvas drag cannot consume the first tap of a second-finger reset',()=>{
 const surface=new EventTarget();let resets=0,time=0;
 const dispose=bindGroundDoubleTap(surface,{allowNonPrimary:true,onDoubleTap:()=>resets++,now:()=>time});
 const send=(type,fields={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:40,clientY:70,...fields});surface.dispatchEvent(event);time+=30;};
 send('pointerdown');send('pointermove',{clientX:90});
 for(let tap=0;tap<2;tap++){send('pointerdown',{pointerId:2,isPrimary:false});send('pointerup',{pointerId:2,isPrimary:false});}
 assert.equal(resets,1);dispose();
});

test('ground targeting selects the tapped floor and rejects sky, walls and off-canvas points',()=>{
 const camera=new THREE.PerspectiveCamera(60,1,.01,100);camera.position.set(0,3,8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),rect={left:10,top:20,width:100,height:100},event={clientX:60,clientY:70};
 const pick=(meshes,changes={})=>groundPointFromPointer({ray,camera,rect,event:{...event,...changes},meshes});
 const point=pick([floor]);assert.ok(point);assert.ok(Math.abs(point.x)<1e-6&&Math.abs(point.y)<1e-6&&Math.abs(point.z)<1e-6);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(8,5,.2),new THREE.MeshBasicMaterial());wall.position.set(0,2.5,4);wall.updateMatrixWorld(true);
 assert.equal(pick([floor,wall]),null,'a wall must occlude the floor');assert.equal(pick([]),null);assert.equal(pick([floor],{clientX:200}),null);
 floor.geometry.dispose();floor.material.dispose();wall.geometry.dispose();wall.material.dispose();
});

test('repeated precise arrival markers reuse their GPU resources and retain the selected floor height',()=>{
 const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8'),start=source.indexOf('  function updateLandingFrame('),end=source.indexOf('  function resetPlayer(',start);
 const landingFrame=new THREE.Group(),update=new Function('THREE','landingFrame','alignSpawnToCurrentFloor',source.slice(start,end)+';return updateLandingFrame;')(THREE,landingFrame,point=>point.clone().setY(20));
 update(new THREE.Vector3(1,2,3),{align:false});
 const resources=landingFrame.children.map(child=>[child.geometry,child.material]);
 for(let i=0;i<30;i++)update(new THREE.Vector3(i,2,i+1),{align:false});
 assert.equal(landingFrame.children.length,2);
 landingFrame.children.forEach((child,i)=>{assert.equal(child.geometry,resources[i][0]);assert.equal(child.material,resources[i][1]);assert.equal(child.position.x,29);assert.equal(child.position.z,30);assert.ok(child.position.y<2.1);child.geometry.dispose();child.material.dispose();});
});
