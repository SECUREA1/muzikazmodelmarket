import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoResidentLabelLayout,createWorldResident,updateWorldResident} from '../public/js/world-resident-model.js';

function dispose(root){
 const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)resources.add(material);});for(const resource of resources)resource.dispose();
}

test('casino captions remain within readable screen bounds across desktop, mobile and near approaches',()=>{
 for(const [viewportWidth,viewportHeight]of [[320,568],[390,844],[844,390],[1280,900]])for(const distance of [.25,.5,1,2,4,8,20,50])for(const speaking of [false,true]){
  const projectionY=1/Math.tan(68*Math.PI/360),layout=casinoResidentLabelLayout({distance,viewportWidth,viewportHeight,projectionY,speaking});
  const pixelsPerWorldUnit=projectionY*viewportHeight/(2*distance),projectedWidth=layout.width*pixelsPerWorldUnit,projectedHeight=layout.height*pixelsPerWorldUnit;
  assert.ok(projectedWidth<=Math.min(260,viewportWidth*.55)+1e-9,{viewportWidth,distance,speaking,projectedWidth});
  assert.ok(projectedHeight<=(speaking?54:28)+1e-9,{viewportWidth,distance,speaking,projectedHeight});
  assert.ok(layout.width>0&&layout.height>0&&Number.isFinite(layout.width));
  assert.ok(layout.opacity>=0&&layout.opacity<=1);
 }
});

test('distant idle nameplates fade before active dialogue so background NPCs do not cover the scene',()=>{
 assert.equal(casinoResidentLabelLayout({distance:10,speaking:false}).opacity,0);
 assert.ok(casinoResidentLabelLayout({distance:10,speaking:true}).opacity>0);
 assert.equal(casinoResidentLabelLayout({distance:25,speaking:true}).opacity,0);
 assert.equal(casinoResidentLabelLayout({distance:2,speaking:true}).opacity,1);
 // An off-axis label uses camera depth for scale and full distance for fading.
 const offAxis=casinoResidentLabelLayout({distance:4,visibilityDistance:10,speaking:false});
 assert.equal(offAxis.opacity,0);
 assert.ok(offAxis.width*1.8*720/(2*4)<=260+1e-9);
});

test('casino roles have different uniforms and physical appearance, and turn toward their conversation partner',()=>{
 const guard=createWorldResident(),dealer=createWorldResident(),guest=createWorldResident();
 try{
  guard.userData.residentState={casino:true,duty:'guard',gesture:'watch',appearance:{hairstyle:'short',height:1.1,build:1.12},lookAt:{x:3,y:1.6,z:-3}};
  dealer.userData.residentState={casino:true,duty:'dealer',gesture:'deal',appearance:{hairstyle:'bun',height:.94,build:.9,accessory:'glasses'}};
  guest.userData.residentState={casino:true,duty:'guest',gesture:'listen',appearance:{hairstyle:'curly',height:1,build:1.02,accessory:'earrings'}};
  for(const actor of [guard,dealer,guest])updateWorldResident(actor,1.2);
  assert.equal(guard.getObjectByName('RESIDENT_GUARD_CAP').visible,true);
  assert.equal(dealer.getObjectByName('RESIDENT_GUARD_CAP').visible,false);
  assert.equal(guest.getObjectByName('RESIDENT_GUARD_CAP').visible,false);
  assert.equal(dealer.getObjectByName('RESIDENT_FORMAL_UNIFORM').visible,true);
  assert.equal(guest.getObjectByName('RESIDENT_FORMAL_UNIFORM').visible,false);
  assert.equal(dealer.getObjectByName('RESIDENT_GLASSES').visible,true);
  assert.equal(guest.getObjectByName('RESIDENT_EARRINGS').visible,true);
  assert.notDeepEqual(guard.getObjectByName('RESIDENT_BODY').scale.toArray(),dealer.getObjectByName('RESIDENT_BODY').scale.toArray());
  for(const actor of [guard,dealer,guest])assert.equal(actor.getObjectByName('RESIDENT_HAIRSTYLES').children.filter(part=>part.visible).length,1);
  const head=guard.getObjectByName('RESIDENT_HEAD'),right=guard.getObjectByName('RESIDENT_RIGHT_ARM');
  assert.ok(head.rotation.y<0&&Math.abs(head.rotation.y)<=1.05);
  guard.userData.residentState.lookAt={x:-3,y:1.6,z:-3};updateWorldResident(guard,1.3);assert.ok(head.rotation.y>0&&Math.abs(head.rotation.y)<=1.05);
  assert.notEqual(dealer.getObjectByName('RESIDENT_RIGHT_ARM').rotation.x,right.rotation.x);
 }finally{for(const actor of [guard,dealer,guest])dispose(actor);}
});
