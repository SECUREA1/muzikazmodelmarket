import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldResident,updateWorldResident,residentVisualStyle,residentLabelLayout,casinoResidentLabelLayout} from '../public/js/world-resident-model.js';
import {RESIDENT_FORMS} from '../public/js/resident-personalities.js';
const dispose=root=>{const resources=new Set();root.traverse(n=>{if(n.geometry)resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m)resources.add(m);});for(const r of resources)r.dispose();};
test('contextual work uniforms and individualized saved appearances render outside the casino',()=>{
 const cases=[['sports','RESIDENT_SPORT_JERSEY'],['nautical','RESIDENT_NAUTICAL_VEST'],['aviation','RESIDENT_EAR_PROTECTION'],['music','RESIDENT_MUSIC_SCARF'],['construction','RESIDENT_HARD_HAT'],['training','RESIDENT_HIGH_VIS_VEST'],['arcade','RESIDENT_ARCADE_JACKET']];
 for(const [uniform,part]of cases){const root=createWorldResident();try{root.userData.residentState={name:'Saved resident',uniform,appearance:{hairstyle:'bun',hair:'#999999',skin:'#764c37',outfit:'#315c78',accent:'#ffdd99',accessory:'glasses',height:1.07,build:.91},gesture:'listen'};updateWorldResident(root,2);assert.equal(root.getObjectByName(part).visible,true,uniform);assert.equal(root.getObjectByName('RESIDENT_GLASSES').visible,true);assert.equal(root.getObjectByName('RESIDENT_BODY').scale.y,1.07);assert.equal(root.getObjectByName('RESIDENT_BODY').scale.x,.91);assert.equal(root.userData.residentMaterials.outfit.color.getHexString(),'315c78');assert.equal(root.getObjectByName('RESIDENT_FORMAL_UNIFORM').visible,false);}finally{dispose(root);}}
});
test('old saves without appearance data get stable individual designs and sensible role uniforms',()=>{
 const state={name:'Maya Vale',role:'Ground crew',placeName:'Airport Terminal'},one=residentVisualStyle(state),two=residentVisualStyle(structuredClone(state)),other=residentVisualStyle({...state,name:'Theo Lane'});assert.deepEqual(one,two);assert.equal(one.uniform,'aviation');assert.notDeepEqual(one.appearance,other.appearance);assert.equal(residentVisualStyle({role:'Dock crew'}).uniform,'nautical');assert.equal(residentVisualStyle({role:'Community musician'}).uniform,'music');assert.equal(residentVisualStyle({appearance:{hairstyle:'invalid'}}).appearance.hairstyle,'short');
});
test('non-casino work, listening and practice gestures track a world-space conversation partner',()=>{
 const root=createWorldResident();try{root.position.set(10,0,10);root.rotation.y=Math.PI/2;root.userData.residentState={name:'Guide',role:'Training guide',gesture:'listen',lookAt:{x:7,y:1.6,z:7}};updateWorldResident(root,2);const head=root.getObjectByName('RESIDENT_HEAD'),arm=root.getObjectByName('RESIDENT_RIGHT_ARM'),listen=arm.rotation.x;assert.ok(Math.abs(head.rotation.y)>.1);assert.ok(Math.abs(head.rotation.y)<=1.05);root.userData.residentState.gesture='explain';updateWorldResident(root,2);assert.notEqual(arm.rotation.x,listen);root.userData.residentState.gesture='practise';root.userData.residentState.prop='clipboard';updateWorldResident(root,3);assert.equal(root.userData.residentProp.visible,true);assert.equal(root.userData.residentProp.children.find(n=>n.name==='clipboard').visible,true);}finally{dispose(root);}
});
test('all-map labels share the casino screen cap and hide distant idle captions',()=>{
 assert.equal(residentLabelLayout,casinoResidentLabelLayout);const layout=residentLabelLayout({distance:.5,viewportWidth:320,viewportHeight:568,projectionY:1.6,speaking:true});assert.ok(layout.width*1.6*568/(2*.5)<=320*.55+1e-9);assert.equal(residentLabelLayout({distance:1,visibilityDistance:20,speaking:false}).opacity,0);assert.equal(residentLabelLayout({distance:2,speaking:false}).pixelsHigh,28);
});

test('distinct resident forms keep the shared animation rig and work uniforms when saved state changes',()=>{
 const root=createWorldResident();try{
  for(const form of RESIDENT_FORMS){
   root.userData.residentState={name:'Form tester',appearance:{form},uniform:'construction',moving:true,gesture:'walk'};updateWorldResident(root,2);
   const parts=root.userData.residentParts;
   assert.deepEqual(parts.forms.children.filter(part=>part.visible).map(part=>part.name),form==='human'?[]:[form]);
   assert.equal(parts.tail.visible,form==='foxfolk');assert.equal(parts.nose.visible,!['foxfolk','automaton'].includes(form));
   assert.equal(parts.hardHat.visible,true);assert.notEqual(root.getObjectByName('RESIDENT_LEFT_LEG').rotation.x,0);
   if(form==='automaton')assert.equal(parts.hairstyles.children.filter(part=>part.visible)[0].name,'bald');
  }
  root.userData.residentState={appearance:{form:'unknown'}};updateWorldResident(root,3);
  assert.equal(root.userData.residentParts.forms.children.some(part=>part.visible),false);
  assert.equal(root.userData.residentParts.tail.visible,false);
  assert.equal(residentVisualStyle({appearance:{form:'unknown'}}).appearance.form,'human');
 }finally{dispose(root);}
});
