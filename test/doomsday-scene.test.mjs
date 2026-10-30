import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createDoomsdayScene} from '../public/js/doomsday-scene.js';

const environment={id:'test-sky'},position={x:0,y:0,z:0};
const state=(phase,phaseElapsedMs=0)=>({id:'test-event',phase,phaseElapsedMs,objectives:[]});

test('detonation expands distant fireballs and shockwaves then changes the sky and starts falling ash',()=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color('#124567');scene.fog=new THREE.Fog('#224466',20,160);
 const effects=createDoomsdayScene({scene,performanceMode:true}),original=scene.background.getHex(),fog=scene.fog.color.getHex();
 effects.update(state('warning'),environment,position,0);const warning=effects.root.userData.skyColor;
 const sky=effects.root.getObjectByName('DOOMSDAY_COLOURED_SKY');assert.ok(sky.material.uniforms.opacity.value>.2);
 effects.update(state('detonation',800),environment,position,1);const first=effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_1'),ball=first.getObjectByName('GROWING_FIREBALL'),wave=first.getObjectByName('EXPANDING_SHOCKWAVE'),initial=ball.scale.x;
 assert.equal(ball.visible,true);assert.equal(wave.visible,true);
 effects.update(state('detonation',2500),environment,position,2);assert.ok(ball.scale.x>initial);assert.ok(wave.scale.x>30);assert.notEqual(effects.root.userData.skyColor,warning);
 effects.update(state('fallout'),environment,position,8);const dust=effects.root.getObjectByName('DOOMSDAY_FALLING_ASH');assert.equal(dust.visible,true);const height=dust.geometry.attributes.position.getY(0);
 effects.update(state('fallout'),environment,position,9);assert.notEqual(dust.geometry.attributes.position.getY(0),height);
 assert.equal(scene.background.getHex(),original);assert.equal(scene.fog.color.getHex(),fog,'authored weather stays intact under the effect');
 effects.update(state('all-clear'),environment,position,12);assert.equal(effects.root.visible,false);effects.dispose();assert.equal(scene.children.length,0);
});

test('reduced motion gives a settled cloud and steady ash without expanding blasts or shockwaves',()=>{
 const scene=new THREE.Scene(),effects=createDoomsdayScene({scene,performanceMode:true});
 effects.update(state('detonation',1500),environment,position,1,{reducedMotion:true});
 const blast=effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_1');assert.equal(blast.getObjectByName('GROWING_FIREBALL').visible,false);assert.equal(blast.getObjectByName('EXPANDING_SHOCKWAVE').visible,false);assert.equal(blast.getObjectByName('RISING_FALLOUT_CLOUD').visible,true);
 effects.update(state('fallout'),environment,position,2,{reducedMotion:true});const ash=effects.root.getObjectByName('DOOMSDAY_FALLING_ASH'),heights=Array.from(ash.geometry.attributes.position.array);
 effects.update(state('fallout'),environment,position,7,{reducedMotion:true});assert.deepEqual(Array.from(ash.geometry.attributes.position.array),heights);
 effects.reset();assert.equal(effects.root.visible,false);effects.dispose();effects.dispose();
});

test('synchronized presentation time drives progress even when a viewer joins during the explosion',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 effects.update({id:'shared',phase:'detonation',phaseStartedAt:100000,presentationTime:103000,phaseElapsedMs:2000,objectives:[]},environment,position,0);
 assert.equal(effects.root.userData.phaseAge,3,'interpolated clock takes precedence over an older snapshot age');assert.ok(effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_1').userData.progress>.5);effects.dispose();
});

test('all three impacts finish on their shared clock across the start of fallout',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 const draw=(phase,at)=>effects.update({id:'full-bombing',phase,detonationAt:100000,phaseStartedAt:phase==='detonation'?100000:107000,presentationTime:at,objectives:[]},environment,position,0);
 draw('detonation',103100);
 const last=effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_3'),ball=last.getObjectByName('GROWING_FIREBALL'),wave=last.getObjectByName('EXPANDING_SHOCKWAVE');
 assert.equal(ball.visible,false,'the third impact waits for its own 3.2-second cue');
 draw('detonation',103300);assert.equal(ball.visible,true);assert.equal(wave.visible,true);
 draw('detonation',106999);const scale=ball.scale.x,cloudProgress=last.userData.progress;
 draw('fallout',107000);
 assert.equal(ball.visible,true,'the final fireball is not removed at the phase boundary');assert.equal(wave.visible,true);
 assert.ok(Math.abs(ball.scale.x-scale)<.02);assert.ok(Math.abs(last.userData.progress-cloudProgress)<.001,'the cloud continues growing without snapping to full size');
 assert.equal(effects.root.getObjectByName('DOOMSDAY_FALLING_ASH').visible,true,'fallout begins while the final impact finishes');
 draw('fallout',108300);assert.equal(ball.visible,false);assert.equal(wave.visible,false);assert.equal(last.userData.progress,1);
 draw('fallout',3100000);assert.equal(ball.visible,false,'long quest phases never replay impacts');assert.equal(effects.root.visible,true);
 assert.equal(last.getObjectByName('RISING_FALLOUT_CLOUD').visible,true);
 effects.dispose();
});

test('warning beacons visibly rotate and pulse, with steady reduced-motion lamps',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 const sites=[{id:'shelter',phase:'warning',name:'Shelter',position:{x:12,y:2,z:-10}}];
 effects.update({...state('warning'),objectives:sites},environment,position,0);
 const beacon=effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0'),rotor=beacon.getObjectByName('ROTATING_SIREN_LAMP'),lens=beacon.getObjectByName('PULSING_WARNING_LENS'),angle=rotor.rotation.y,pulse=lens.material.opacity;
 assert.equal(rotor.children.filter(child=>child.name==='REVOLVING_WARNING_BEAM').length,2);
 const siteBeacon=effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_2');assert.equal(siteBeacon.visible,true);assert.equal(siteBeacon.position.x,14.5);assert.equal(siteBeacon.position.y,2);
 effects.update({...state('warning',500),objectives:sites},environment,position,.5);assert.notEqual(rotor.rotation.y,angle);assert.notEqual(lens.material.opacity,pulse);
 const arrival=effects.root.getObjectByName('DOOMSDAY_ARRIVAL_WARNING_BEACONS');assert.equal(arrival.position.y,2);effects.update({...state('warning',800),objectives:sites},environment,{x:50,y:30,z:30},.8);assert.equal(arrival.position.x,0,'warning lamps stay grounded at the event arrival, not attached to a moving aircraft');assert.equal(arrival.position.y,2);
 effects.update({...state('warning',1000),objectives:sites},environment,position,1,{reducedMotion:true});const stillAngle=rotor.rotation.y,stillPulse=lens.material.opacity;
 effects.update({...state('warning',9000),objectives:sites},environment,position,9,{reducedMotion:true});assert.equal(rotor.rotation.y,stillAngle);assert.equal(lens.material.opacity,stillPulse);
 effects.dispose();
});

test('clearing fades the sky, clouds, ash and beacons and repeated quiet intervals retain no event props',()=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color('#3388aa');const effects=createDoomsdayScene({scene,performanceMode:true}),original=scene.background.getHex();
 effects.update(state('idle'),environment,position,0);assert.equal(effects.root.visible,false);
 const clearing=age=>({id:'scheduled-1',phase:'clearing',phaseElapsedMs:age,phaseStartedAt:100000,phaseEndsAt:108000,objectives:[]});
 effects.update(clearing(0),environment,position,0);
 const sky=effects.root.getObjectByName('DOOMSDAY_COLOURED_SKY'),ash=effects.root.getObjectByName('DOOMSDAY_FALLING_ASH'),cloud=effects.root.getObjectByName('RISING_FALLOUT_CLOUD'),lamp=effects.root.getObjectByName('PULSING_WARNING_LENS');
 const skyStart=sky.material.uniforms.opacity.value,ashStart=ash.material.opacity,cloudStart=cloud.children[0].material.opacity;
 effects.update(clearing(4000),environment,position,4);assert.equal(effects.root.userData.effectOpacity,.5);assert.ok(sky.material.uniforms.opacity.value<skyStart);assert.ok(ash.material.opacity<ashStart);assert.ok(cloud.children[0].material.opacity<cloudStart);assert.ok(lamp.material.opacity<.6);
 effects.update(clearing(8000),environment,position,8);assert.equal(sky.material.uniforms.opacity.value,0);assert.equal(ash.material.opacity,0);assert.equal(lamp.material.opacity,0);
 effects.update(state('all-clear'),environment,position,9);assert.equal(effects.root.visible,false);assert.equal(scene.background.getHex(),original);
 const count=()=>{let total=0;effects.root.traverse(()=>total++);return total;},before=count();
 for(let index=0;index<20;index++){effects.update({...state('warning'),id:'repeat-'+index},environment,position,index);effects.update({...clearing(8000),id:'repeat-'+index},environment,position,index+1);effects.update(state('all-clear'),environment,position,index+2);}
 assert.equal(count(),before,'beacons and all other persistent effects are pooled across repeats');effects.dispose();
});


test('unfollowing removes objective markers while beacons, sky and event animation continue',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 const active={...state('warning'),objectives:[{id:'shelter',name:'Shelter',phase:'warning',position:{x:2,y:0,z:3}}]};
 effects.update(active,environment,position,1);
 const sites=effects.root.getObjectByName('DOOMSDAY_RESPONSE_SITES'),beacon=effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0');
 assert.equal(sites.children.length,1,'direct callers keep objectives by default');
 assert.ok(sites.children[0].children.length>=8,'shelter checkpoint has an open entrance frame and approach lights');
 const angle=beacon.getObjectByName('ROTATING_SIREN_LAMP').rotation.y;
 effects.update({...active,phaseElapsedMs:1000},environment,position,2,{showObjectives:false});
 assert.equal(sites.children.length,0);assert.equal(effects.root.visible,true);assert.equal(beacon.visible,true);
 assert.notEqual(beacon.getObjectByName('ROTATING_SIREN_LAMP').rotation.y,angle);
 effects.update({...active,phaseElapsedMs:2000},environment,position,3,{showObjectives:true});assert.equal(sites.children.length,1);
 effects.dispose();
});

test('native command and evacuation airframes form a bounded noncolliding response fleet',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 effects.update(state('warning',3000),environment,position,3,{showObjectives:false});
 const fleet=effects.root.getObjectByName('DOOMSDAY_RESPONSE_AIRCRAFT'),command=fleet.getObjectByName('DOOMSDAY_RESPONSE_COMMAND'),evacuation=fleet.getObjectByName('DOOMSDAY_RESPONSE_EVACUATION');
 assert.equal(fleet.children.length,2);assert.equal(command.userData.modelId,'doomsday-command-aircraft');assert.equal(evacuation.userData.modelId,'doomsday-evacuation-aircraft');
 assert.ok(command.userData.dimensions[1]>evacuation.userData.dimensions[1],'command aircraft retains its raised continuity dome');
 assert.equal(command.visible,true);assert.equal(evacuation.visible,false,'relief aircraft wait until fallout begins');
 for(const model of [command,evacuation]){
  let meshes=0;model.traverse(node=>{assert.equal(node.userData.collisionDisabled,true);assert.equal(node.userData.collider,false);if(node.isMesh){meshes++;assert.equal(node.material.map,null);}});
  assert.ok(meshes<50,'distant airframes are batched for mobile rendering');assert.ok(model.userData.aircraftRig.propeller);assert.equal(model.userData.aircraftRig.lights.length,3);
 }
 effects.update(state('fallout',1000),environment,position,26,{showObjectives:false});assert.equal(command.visible,true);assert.equal(evacuation.visible,true);
 assert.ok(evacuation.position.y-command.position.y>=10,'relief joins above the command flight');
 assert.equal(effects.root.getObjectByName('DOOMSDAY_RESPONSE_SITES').children.length,0,'ambient response flights do not turn on challenge markers');
 effects.dispose();
});

test('response flight positions use one authored map anchor even when viewers move or join late',()=>{
 const map={id:'response-airport',playableSize:2000,spawn:{x:-58,y:0,z:74},airport:{enabled:true,runways:[{id:'runway',x:40,z:0,width:16,length:202}]}},first=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true}),late=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 const shared={id:'room-event',phase:'fallout',startedAt:100000,phaseStartedAt:125000,falloutAt:125000,presentationTime:190000,objectives:[]};
 first.update(shared,map,{x:0,y:0,z:0},90);late.update(shared,map,{x:550,y:70,z:-350},0);
 const fleet=first.root.getObjectByName('DOOMSDAY_RESPONSE_AIRCRAFT'),other=late.root.getObjectByName('DOOMSDAY_RESPONSE_AIRCRAFT');
 assert.deepEqual(fleet.userData.anchor,{x:40,y:0,z:0});
 for(let index=0;index<2;index++){assert.deepEqual(fleet.children[index].position.toArray(),other.children[index].position.toArray());assert.deepEqual(fleet.children[index].rotation.toArray(),other.children[index].rotation.toArray());}
 const before=fleet.children.map(child=>child.position.toArray());first.update(shared,map,{x:950,y:130,z:-850},92);
 assert.deepEqual(fleet.children.map(child=>child.position.toArray()),before,'response aircraft do not follow the player camera');
 first.update({...shared,presentationTime:shared.presentationTime+3600000},map,position,3600);
 assert.ok(fleet.children.every(child=>child.userData.responseLap>40),'long quest-held phases continue bounded patrol laps');
 first.dispose();late.dispose();
});

test('response propellers, control surfaces and navigation lamps animate, with stable reduced motion',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 effects.update(state('warning',1000),environment,position,1);const command=effects.root.getObjectByName('DOOMSDAY_RESPONSE_COMMAND'),rig=command.userData.aircraftRig,propeller=rig.propeller.rotation.z,aileron=rig.ailerons[0].rotation.x;
 effects.update(state('warning',5000),environment,position,5);assert.notEqual(rig.propeller.rotation.z,propeller);assert.notEqual(rig.ailerons[0].rotation.x,aileron);assert.ok(rig.gear.every(leg=>leg.visible),'the actual fixed landing gear stays attached in flight');
 effects.update(state('warning',6000),environment,position,6,{reducedMotion:true});const stable={position:command.position.toArray(),rotation:command.rotation.toArray(),propeller:rig.propeller.rotation.z,ailerons:rig.ailerons.map(surface=>surface.rotation.x),lights:rig.lights.map(lamp=>lamp.visible)};
 effects.update(state('warning',16000),environment,position,16,{reducedMotion:true});
 assert.deepEqual({position:command.position.toArray(),rotation:command.rotation.toArray(),propeller:rig.propeller.rotation.z,ailerons:rig.ailerons.map(surface=>surface.rotation.x),lights:rig.lights.map(lamp=>lamp.visible)},stable);
 effects.dispose();
});

test('response aircraft fade and reuse their pooled geometry across events, with full disposal',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true}),clearing=age=>({id:'flight-event',phase:'clearing',phaseStartedAt:200000,phaseEndsAt:208000,startedAt:100000,presentationTime:200000+age,objectives:[]});
 effects.update(clearing(0),environment,position,100);const fleet=effects.root.getObjectByName('DOOMSDAY_RESPONSE_AIRCRAFT'),models=[...fleet.children],meshes=[];fleet.traverse(node=>{if(node.isMesh)meshes.push(node);});
 const geometries=new Set(meshes.map(mesh=>mesh.geometry)),materials=new Set(meshes.map(mesh=>mesh.material)),releasedGeometry=new Set(),releasedMaterial=new Set();
 for(const geometry of geometries)geometry.addEventListener('dispose',()=>releasedGeometry.add(geometry));for(const material of materials)material.addEventListener('dispose',()=>releasedMaterial.add(material));
 effects.update(clearing(4000),environment,position,104);assert.equal(fleet.userData.opacity,.5);assert.ok([...materials].every(material=>material.opacity===material.userData.responseOpacity*.5));
 effects.update(clearing(8000),environment,position,108);assert.equal(fleet.visible,false);assert.ok([...materials].every(material=>material.opacity===0));
 effects.update(state('all-clear'),environment,position,109);assert.equal(effects.root.visible,false);
 for(let index=0;index<12;index++){effects.update({...state('warning'),id:'repeat-flight-'+index},environment,position,index);effects.update(state('all-clear'),environment,position,index+1);}
 assert.deepEqual(fleet.children,models);const after=new Set();fleet.traverse(node=>{if(node.geometry)after.add(node.geometry);});assert.deepEqual(after,geometries);
 assert.equal(releasedGeometry.size,0,'quiet intervals do not reallocate the fleet');effects.dispose();assert.equal(releasedGeometry.size,geometries.size);assert.equal(releasedMaterial.size,materials.size);
});

test('completed shelters remain discoverable during fallout without forcing challenge markers on',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 const active={...state('fallout'),objectives:[{id:'shelter',name:'Shelter',phase:'warning',completed:true,position:{x:2,y:0,z:3}}]};
 effects.update(active,environment,position,1,{showObjectives:true});
 assert.ok(effects.root.getObjectByName('doomsday-objective-shelter'));
 effects.update(active,environment,position,2,{showObjectives:false});
 assert.equal(effects.root.getObjectByName('doomsday-objective-shelter'),undefined);
 effects.dispose();
});
