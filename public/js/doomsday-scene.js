import * as THREE from '../vendor/three/three.module.min.js';
import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import {createCivilAircraft} from './civil-aircraft-models.js';
import {createDoomsdayResponsePlan,sampleDoomsdayResponseFlight} from './doomsday-response-flight.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const skyVertex='varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const skyFragment='varying vec3 direction;uniform vec3 horizon;uniform vec3 zenith;uniform float opacity;void main(){float height=clamp(normalize(direction).y,0.,1.);gl_FragColor=vec4(mix(horizon,zenith,smoothstep(0.,.8,height)),opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';

// The native airframes retain their recognizable body, livery and moving rig.
// Cockpit lettering and tiny fittings are not useful at response-flight range.
// Bake the remaining stationary surfaces by paint so two pooled aircraft add a
// bounded number of draw calls rather than hundreds of individual details.
function responseAircraft(modelId,materials,geometries){
 const source=createCivilAircraft(modelId),root=new THREE.Group(),sourceGeometries=new Set(),sourceMaterials=new Set(),ownedTextures=new Set(),paint=new Map(),originalRig=source.userData.aircraftRig;
 root.name='DOOMSDAY_RESPONSE_'+(modelId.includes('command')?'COMMAND':'EVACUATION');
 source.updateMatrixWorld(true);
 source.traverse(node=>{if(node.geometry)sourceGeometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){sourceMaterials.add(material);if(node.name==='AIRCRAFT_LABEL'&&material.map)ownedTextures.add(material.map);}});
 const dynamic=new Set(),parts=[];
 const take=(kind,node)=>{if(node){parts.push({kind,node});node.traverse(child=>dynamic.add(child));}};
 take('propeller',originalRig.propeller);
 for(const kind of ['ailerons','flaps','gear'])for(const node of originalRig[kind]||[])take(kind,node);
 take('elevator',originalRig.elevator);take('rudder',originalRig.rudder);
 source.traverse(node=>{if(/^(NAVIGATION_LIGHT|TAIL_BEACON)$/.test(node.name))take('lights',node);});
 const interior=/AIRCRAFT_LABEL|INSTRUMENT|GAUGE|PFD_|GLASS_DISPLAY|LIVE_ATTITUDE|SPEED_ALTITUDE|COCKPIT_SWITCH|SEAT_|SEAT$|CONTROL_GRIP|LOWER_CABIN_DOOR_HANDLE/;
 const visible=node=>{for(let current=node;current;current=current.parent)if(!current.visible)return false;return true;};
 function paintFor(original){
  const opacity=Number.isFinite(original.opacity)?original.opacity:1,key=[original.color?.getHex()??0xc7d0ce,original.emissive?.getHex()||0,opacity,original.side].join(':');
  if(!paint.has(key)){const material=new THREE.MeshBasicMaterial({color:original.color?.getHex()??0xc7d0ce,transparent:true,opacity,side:original.side??THREE.FrontSide,depthWrite:opacity>.9,fog:false,toneMapped:false});material.userData.responseOpacity=opacity;paint.set(key,material);materials.push(material);}
  return paint.get(key);
 }
 function bake(scope,exclude){
  const group=new THREE.Group(),batches=new Map(),inverse=new THREE.Matrix4().copy(scope.matrixWorld).invert();
  scope.matrixWorld.decompose(group.position,group.quaternion,group.scale);
  scope.traverse(node=>{
   if(!node.isMesh||node.isInstancedMesh||exclude?.has(node)||!visible(node)||interior.test(node.name)||!node.geometry?.attributes.position)return;
   const original=Array.isArray(node.material)?node.material[0]:node.material;if(!original||original.opacity===0)return;
   const material=paintFor(original),geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
   for(const key of Object.keys(geometry.attributes))if(key!=='position'&&key!=='normal')geometry.deleteAttribute(key);
   if(!geometry.attributes.normal)geometry.computeVertexNormals();
   geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld));
   if(!batches.has(material))batches.set(material,[]);batches.get(material).push(geometry);
  });
  for(const [material,parts]of batches){const geometry=mergeGeometries(parts,false);for(const part of parts)part.dispose();if(!geometry)continue;geometry.computeBoundingSphere();geometries.push(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.name='RESPONSE_AIRFRAME_SURFACE';mesh.userData={collisionDisabled:true,collider:false};group.add(mesh);}
  return group;
 }
 const body=bake(source,dynamic);body.name='RESPONSE_AIRFRAME';root.add(body);
 const rig={ailerons:[],flaps:[],gear:[],lights:[],fixedGear:originalRig.fixedGear===true};
 for(const {kind,node}of parts){const part=bake(node);part.name=node.name||kind;part.userData.side=node.userData.side;part.userData.responseBaseRotation=part.rotation.clone();root.add(part);if(Array.isArray(rig[kind]))rig[kind].push(part);else rig[kind]=part;}
 root.userData={modelId,dimensions:[...source.userData.dimensions],aircraftModel:true,doomsdayAircraft:true,responseAircraft:true,collisionDisabled:true,collider:false,aircraftRig:rig,responseMaterials:[...paint.values()]};
 root.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;node.castShadow=node.receiveShadow=false;});
 // Native surface textures are shared by other world models. Only locally
 // owned labels may be released; no shared paint texture is ever disposed.
 for(const geometry of sourceGeometries)geometry.dispose();for(const material of sourceMaterials)material.dispose();for(const texture of ownedTextures)texture.dispose();source.clear();source.userData={};
 return root;
}

// The event has its own sky layer. Weather and authored map materials remain
// intact underneath it and are immediately visible again when the event ends.
export function createDoomsdayScene({scene,performanceMode=false}={}){
 const root=new THREE.Group();root.name='MUZIKAZ_DOOMSDAY_EVENT';root.visible=false;root.userData={collisionDisabled:true,collider:false};scene.add(root);
 const skyline=new THREE.Group(),sites=new THREE.Group();skyline.name='DOOMSDAY_SKYLINE';sites.name='DOOMSDAY_RESPONSE_SITES';root.add(skyline,sites);
 const materials=[],geometries=[];
 const material=(color,opacity)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,toneMapped:false});materials.push(m);return m;};
 const glow=material(0x9bff45,.14),amber=material(0xffa12e,.18),outline=material(0x83ffd7,.5),fire=material(0xffbc54,.7),smoke=material(0xcdbd65,.22),wave=material(0xffe4a0,.4),horizonGlow=material(0xbcde72,.045),beaconLens=material(0xffc247,.8),beaconBeam=material(0xffb54d,.12),beaconBody=material(0x718c7a,.9);
 smoke.blending=THREE.NormalBlending;smoke.color.set(0x776844);
 const mesh=(geometry,m,parent,permanent=true)=>{if(permanent)geometries.push(geometry);const object=new THREE.Mesh(geometry,m);parent.add(object);return object;};
 const atmosphere=new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,fog:false,uniforms:{horizon:{value:new THREE.Color(0x59382b)},zenith:{value:new THREE.Color(0x141820)},opacity:{value:0}},vertexShader:skyVertex,fragmentShader:skyFragment});materials.push(atmosphere);
 const sky=mesh(new THREE.SphereGeometry(540,performanceMode?24:40,16),atmosphere,skyline);sky.name='DOOMSDAY_COLOURED_SKY';sky.renderOrder=-90;sky.frustumCulled=false;
 const haze=mesh(new THREE.CylinderGeometry(220,220,65,performanceMode?24:48,1,true),horizonGlow,skyline);haze.name='DOOMSDAY_GLOWING_HORIZON';haze.position.y=10;
 for(let index=0;index<(performanceMode?18:32);index++){
  const angle=index*Math.PI*2/(performanceMode?18:32),height=10+(index*17%33);
  const tower=mesh(new THREE.BoxGeometry(7+(index%3)*3,height,7),index%3?glow:amber,skyline);tower.position.set(Math.sin(angle)*180,height/2-8,Math.cos(angle)*180);
 }
 const blasts=[];
 for(let index=0;index<3;index++){
  const blast=new THREE.Group();blast.name='DOOMSDAY_DISTANT_BLAST_'+(index+1);blast.position.set(...[[105,0,-155],[-135,0,-150],[175,0,60]][index]);skyline.add(blast);
  const ball=mesh(new THREE.SphereGeometry(1,performanceMode?12:20,12),fire,blast);ball.name='GROWING_FIREBALL';ball.position.y=18;
  const shockwave=mesh(new THREE.TorusGeometry(1,.035,6,performanceMode?32:56),wave,blast);shockwave.name='EXPANDING_SHOCKWAVE';shockwave.rotation.x=-Math.PI/2;shockwave.position.y=1;
  const cloud=new THREE.Group();cloud.name='RISING_FALLOUT_CLOUD';blast.add(cloud);
  const stem=mesh(new THREE.CylinderGeometry(6,12,38,12),smoke,cloud);stem.position.y=19;
  const cap=mesh(new THREE.SphereGeometry(27,performanceMode?12:20,10),smoke,cloud);cap.position.y=43;cap.scale.y=.5;
  for(let puff=0;puff<5;puff++){const angle=puff*Math.PI*2/5,part=mesh(new THREE.SphereGeometry(12,10,8),smoke,cloud);part.position.set(Math.cos(angle)*18,43+Math.sin(puff*8)*4,Math.sin(angle)*18);part.scale.y=.65;}
  const ring=mesh(new THREE.TorusGeometry(31,1.5,6,40),amber,cloud);ring.position.y=37;ring.rotation.x=Math.PI/2;
  blasts.push({root:blast,ball,shockwave,cloud,index});
 }
 // A fixed pool of beacon rigs covers nearby scenery and the response sites.
 // Rotating transparent cones provide a visible sweep without costly dynamic
 // lights, moving collision, or a full-screen strobe.
 const beacons=[],siteBeacons=new THREE.Group(),arrivalBeacons=new THREE.Group();siteBeacons.name='DOOMSDAY_SITE_WARNING_BEACONS';arrivalBeacons.name='DOOMSDAY_ARRIVAL_WARNING_BEACONS';root.add(siteBeacons,arrivalBeacons);
 function beacon(parent,index){
  const rig=new THREE.Group();rig.name='DOOMSDAY_ROTATING_BEACON_'+index;parent.add(rig);
  const foot=mesh(new THREE.CylinderGeometry(.48,.6,.18,10),beaconBody,rig);foot.position.y=.09;
  const mast=mesh(new THREE.CylinderGeometry(.065,.09,2.8,8),beaconBody,rig);mast.position.y=1.5;
  const ring=mesh(new THREE.CylinderGeometry(.36,.36,.15,12),beaconBody,rig);ring.position.y=2.95;
  const rotor=new THREE.Group();rotor.name='ROTATING_SIREN_LAMP';rotor.position.y=3.2;rig.add(rotor);
  const lamp=mesh(new THREE.SphereGeometry(.25,12,8),beaconLens,rotor);lamp.name='PULSING_WARNING_LENS';lamp.scale.y=1.25;
  for(const side of [-1,1]){const beam=mesh(new THREE.CylinderGeometry(.035,.9,5,8,1,true),beaconBeam,rotor);beam.name='REVOLVING_WARNING_BEAM';beam.rotation.z=side*Math.PI/2;beam.position.x=side*2.5;}
  beacons.push({rig,rotor,index});return rig;
 }
 beacon(arrivalBeacons,0).position.set(-8,0,-12);beacon(arrivalBeacons,1).position.set(8,0,-12);
 for(let index=0;index<3;index++)beacon(siteBeacons,index+2);
 const count=performanceMode?140:300,particles=new Float32Array(count*3),initialY=new Float32Array(count);
 for(let i=0;i<count;i++){particles[i*3]=(i*37%140)-70;particles[i*3+1]=initialY[i]=(i*19%60);particles[i*3+2]=(i*53%140)-70;}
 const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(particles,3));geometries.push(dustGeometry);
 const dustMaterial=new THREE.PointsMaterial({color:0xc8cf9b,size:.17,transparent:true,opacity:.7,depthWrite:false,fog:false});materials.push(dustMaterial);
 const dust=new THREE.Points(dustGeometry,dustMaterial);dust.name='DOOMSDAY_FALLING_ASH';skyline.add(dust);
 const response=new THREE.Group();response.name='DOOMSDAY_RESPONSE_AIRCRAFT';root.add(response);
 let responsePlan=null,responseModels=null;
 function updateResponse(state,environment,time,reducedMotion){
  if(!responseModels)responseModels=['doomsday-command-aircraft','doomsday-evacuation-aircraft'].map(id=>{const model=responseAircraft(id,materials,geometries);response.add(model);return model;});
  if(!responsePlan){responsePlan=createDoomsdayResponsePlan(environment,state);response.userData.anchor={...responsePlan.anchor};}
  const sample=sampleDoomsdayResponseFlight(responsePlan,state,time,{reducedMotion});
  response.visible=sample.active;response.userData.stage=state.phase;response.userData.opacity=sample.opacity;
  sample.aircraft.forEach((pose,index)=>{
   const model=responseModels[index],rig=model.userData.aircraftRig,elapsed=sample.elapsed||0;
   model.visible=pose.visible;model.position.set(pose.position.x,pose.position.y,pose.position.z);model.rotation.set(pose.rotation.x,pose.rotation.y,pose.rotation.z,'YXZ');
   model.userData.responseStage=pose.stage;model.userData.responseLap=pose.lap;model.userData.responseProgress=pose.progress;
   for(const material of model.userData.responseMaterials)material.opacity=material.userData.responseOpacity*sample.opacity;
   const motion=reducedMotion?0:1;
   if(rig.propeller)rig.propeller.rotation.z=rig.propeller.userData.responseBaseRotation.z+motion*(elapsed*(pose.propellerSpeed||32)%(Math.PI*2));
   for(const surface of rig.ailerons)surface.rotation.x=surface.userData.responseBaseRotation.x+motion*(surface.userData.side||1)*pose.rotation.z*.55;
   for(const flap of rig.flaps)flap.rotation.x=flap.userData.responseBaseRotation.x+motion*(pose.stage==='departure'?.15:.02);
   if(rig.elevator)rig.elevator.rotation.x=rig.elevator.userData.responseBaseRotation.x-motion*pose.rotation.x*.55;
   if(rig.rudder)rig.rudder.rotation.y=rig.rudder.userData.responseBaseRotation.y-motion*pose.rotation.z*.25;
   for(const leg of rig.gear)leg.visible=rig.fixedGear||pose.gear!==false;
   for(const lamp of rig.lights)lamp.visible=reducedMotion||Math.sin(elapsed*Math.PI+index)>.05;
  });
 }
 let worldId=null,eventId=null,signature='',phaseKey='',phaseAt=0,disposed=false;
 function clearSites(){for(const child of [...sites.children]){child.traverse(object=>{if(!object.isSprite)object.geometry?.dispose();if(object.material?.map){object.material.map.dispose();object.material.dispose();}});sites.remove(child);}}
 function label(text){
  if(typeof document==='undefined')return new THREE.Group();
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');if(!ctx)return new THREE.Group();ctx.fillStyle='#09180fee';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#caff72';ctx.lineWidth=4;ctx.strokeRect(2,2,508,124);ctx.fillStyle='#eaffcd';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText(text.slice(0,30),256,70);const texture=new THREE.CanvasTexture(canvas),m=new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}),sprite=new THREE.Sprite(m);sprite.scale.set(9,2.25,1);return sprite;
 }
 function update(state,environment,position,time=0,{reducedMotion=false,showObjectives=true}={}){
  if(disposed)return;
  if(worldId!==environment?.id){worldId=environment?.id;eventId=null;responsePlan=null;signature=phaseKey='';clearSites();}
  const active=!!environment&&state&&!['idle','all-clear'].includes(state.phase);root.visible=active;if(!active){response.visible=false;if(signature){signature='';clearSites();}root.userData.phase=state?.phase||'idle';root.userData.effectOpacity=0;return;}
  if(eventId!==state.id){eventId=state.id;responsePlan=null;const nearbySite=[...(state.objectives||[])].sort((a,b)=>Math.hypot(a.position.x-position.x,a.position.z-position.z)-Math.hypot(b.position.x-position.x,b.position.z-position.z))[0];arrivalBeacons.position.set(position.x,nearbySite?.position.y??position.y,position.z);}
  updateResponse(state,environment,time,reducedMotion);
  const nextPhaseKey=state.id+':'+state.phase;if(nextPhaseKey!==phaseKey){phaseKey=nextPhaseKey;phaseAt=time;}
  const presentationTime=state.presentationTime??state.currentServerTime;
  const age=Number.isFinite(presentationTime)&&Number.isFinite(state.phaseStartedAt)?Math.max(0,(presentationTime-state.phaseStartedAt)/1000):Number.isFinite(state.phaseElapsedMs)?Math.max(0,state.phaseElapsedMs/1000):Math.max(0,time-phaseAt);
  skyline.position.set(position.x,position.y,position.z);
  const phase=state.phase,detonation=phase==='detonation',fallout=phase==='fallout',warning=phase==='warning',recovery=phase==='recovery',clearing=phase==='clearing';
  // Staggered impacts share one clock, so the final fireball and shockwave
  // finish naturally as fallout starts rather than being cut off at phase 7s.
  const blastAge=detonation?age:fallout?Number.isFinite(state.detonationAt)&&Number.isFinite(presentationTime)?Math.max(0,(presentationTime-state.detonationAt)/1000):7+age:Infinity;
  const clearingDuration=Number.isFinite(state.phaseEndsAt)&&Number.isFinite(state.phaseStartedAt)?Math.max(.001,(state.phaseEndsAt-state.phaseStartedAt)/1000):8;
  const visibility=clearing?1-clamp(age/clearingDuration):1;root.userData.effectOpacity=visibility;
  const palette=warning?[0x78503b,0x171d29,.3]:detonation?[0xdc793d,0x4d2829,.78]:fallout?[0x879141,0x16221d,.75]:[0x496e60,0x172933,.4];
  atmosphere.uniforms.horizon.value.set(palette[0]);atmosphere.uniforms.zenith.value.set(palette[1]);atmosphere.uniforms.opacity.value=palette[2]*visibility;
  if(detonation){const blend=clamp(age/7);atmosphere.uniforms.horizon.value.lerp(new THREE.Color(0x879141),blend);atmosphere.uniforms.zenith.value.lerp(new THREE.Color(0x16221d),blend);}
  root.userData.phase=phase;root.userData.phaseAge=age;root.userData.skyColor='#'+atmosphere.uniforms.horizon.value.getHexString();
  glow.color.set(fallout?0xa5bc52:detonation?0xffb655:warning?0xffb454:0x6eeec4);glow.opacity=(fallout?.18:detonation?.2:.09)*visibility;amber.opacity=(fallout?.16:detonation?.28:.11)*visibility;
  fire.opacity=reducedMotion?0:.6;wave.opacity=reducedMotion?0:.32;smoke.opacity=(fallout?.34:.28)*visibility;smoke.color.set(fallout?0x66734b:0x80653d);horizonGlow.color.copy(glow.color);horizonGlow.opacity=.045*visibility;outline.opacity=.5*visibility;
  const pulse=reducedMotion?.75:.25+.75*(.5+.5*Math.sin(age*Math.PI));beaconLens.opacity=(.2+pulse*.75)*visibility;beaconBeam.opacity=(.02+pulse*.155)*visibility;beaconBody.opacity=.9*visibility;
  for(const item of beacons){item.rotor.rotation.y=reducedMotion?item.index*Math.PI/3:age*1.6+item.index*Math.PI/3;item.rig.userData.pulse=pulse;item.rig.userData.reducedMotion=reducedMotion;if(item.index>=2){const objective=state.objectives?.[item.index-2];item.rig.visible=!!objective;if(objective)item.rig.position.set(objective.position.x+2.5,objective.position.y,objective.position.z+1);}}
  for(const blast of blasts){
   const elapsed=blastAge-blast.index*1.6,progress=clamp(elapsed/5),emerged=elapsed>=0;
   blast.root.visible=detonation||fallout||recovery||clearing;blast.root.userData.progress=progress;
   blast.ball.visible=(detonation||fallout)&&emerged&&elapsed<4.7&&!reducedMotion;blast.ball.scale.setScalar(2+22*Math.sin(clamp(elapsed/5)*Math.PI*.75));blast.ball.position.y=10+clamp(elapsed/5)*25;
   blast.shockwave.visible=(detonation||fallout)&&emerged&&elapsed<5&&!reducedMotion;blast.shockwave.scale.setScalar(2+clamp(elapsed,0,5)*20);
   blast.cloud.visible=(emerged||reducedMotion)&&(detonation||fallout||recovery||clearing);blast.cloud.scale.setScalar(reducedMotion?.9:.15+progress*.85);blast.cloud.position.y=reducedMotion?0:progress*8;
  }
  dust.visible=fallout||recovery||clearing;dustMaterial.opacity=(recovery||clearing?.28:.7)*visibility;
  if(!reducedMotion&&dust.visible){for(let index=0;index<count;index++){particles[index*3+1]=(initialY[index]-time*(1.1+(index%5)*.17))%60;if(particles[index*3+1]<0)particles[index*3+1]+=60;}dustGeometry.attributes.position.needsUpdate=true;dust.position.x=Math.sin(time*.08)*3;}else dust.position.x=0;
  haze.rotation.y=reducedMotion?0:time*.008;
  const nextSignature=JSON.stringify([state.id,state.phase,showObjectives,state.objectives?.map(o=>[o.id,o.completed])]);
  if(signature!==nextSignature){signature=nextSignature;clearSites();for(const objective of state.objectives||[]){if(!showObjectives||clearing||(objective.id!=='shelter'&&(objective.completed||objective.phase!==state.phase)))continue;const marker=new THREE.Group();marker.name='doomsday-objective-'+objective.id;marker.position.copy(objective.position);marker.userData.doomsdayObjective=objective.id;
   const beam=mesh(new THREE.CylinderGeometry(.12,.6,14,6),outline,marker,false);beam.position.y=7;
   const pad=mesh(new THREE.TorusGeometry(2,.1,6,32),outline,marker,false);pad.rotation.x=-Math.PI/2;pad.position.y=.12;
   if(objective.id==='shelter'){
    // Open waypoint frame: no walls or invisible collision in generated maps.
    for(const side of [-1,1]){const post=mesh(new THREE.BoxGeometry(.12,2.8,.12),outline,marker,false);post.position.set(side*1.6,1.4,1.5);}
    const lintel=mesh(new THREE.BoxGeometry(3.3,.15,.15),outline,marker,false);lintel.position.set(0,2.8,1.5);
    for(let index=0;index<3;index++){const path=mesh(new THREE.BoxGeometry(1.2,.035,.22),outline,marker,false);path.position.set(0,.08,2+index*.7);}
   }
   const name=label(objective.name);name.position.y=4;marker.add(name);sites.add(marker);
  }}
 }
 return {root,update,reset(){root.visible=response.visible=false;worldId=eventId=null;responsePlan=null;signature=phaseKey='';clearSites();},dispose(){if(disposed)return;disposed=true;clearSites();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.remove(root);}};
}
