import * as THREE from '../vendor/three/three.module.min.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const skyVertex='varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const skyFragment='varying vec3 direction;uniform vec3 horizon;uniform vec3 zenith;uniform float opacity;void main(){float height=clamp(normalize(direction).y,0.,1.);gl_FragColor=vec4(mix(horizon,zenith,smoothstep(0.,.8,height)),opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';

// The event has its own sky layer. Weather and authored map materials remain
// intact underneath it and are immediately visible again when the event ends.
export function createDoomsdayScene({scene,performanceMode=false}={}){
 const root=new THREE.Group();root.name='MUZIKAZ_DOOMSDAY_EVENT';root.visible=false;root.userData={collisionDisabled:true,collider:false};scene.add(root);
 const skyline=new THREE.Group(),sites=new THREE.Group();skyline.name='DOOMSDAY_SKYLINE';sites.name='DOOMSDAY_RESPONSE_SITES';root.add(skyline,sites);
 const materials=[],geometries=[];
 const material=(color,opacity)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,toneMapped:false});materials.push(m);return m;};
 const glow=material(0x9bff45,.14),amber=material(0xffa12e,.18),outline=material(0x83ffd7,.5),fire=material(0xffbc54,.7),smoke=material(0xcdbd65,.22),wave=material(0xffe4a0,.4),horizonGlow=material(0xbcde72,.045);
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
 const count=performanceMode?140:300,particles=new Float32Array(count*3),initialY=new Float32Array(count);
 for(let i=0;i<count;i++){particles[i*3]=(i*37%140)-70;particles[i*3+1]=initialY[i]=(i*19%60);particles[i*3+2]=(i*53%140)-70;}
 const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(particles,3));geometries.push(dustGeometry);
 const dustMaterial=new THREE.PointsMaterial({color:0xc8cf9b,size:.17,transparent:true,opacity:.7,depthWrite:false,fog:false});materials.push(dustMaterial);
 const dust=new THREE.Points(dustGeometry,dustMaterial);dust.name='DOOMSDAY_FALLING_ASH';skyline.add(dust);
 let worldId=null,signature='',phaseKey='',phaseAt=0,disposed=false;
 function clearSites(){for(const child of [...sites.children]){child.traverse(object=>{if(!object.isSprite)object.geometry?.dispose();if(object.material?.map){object.material.map.dispose();object.material.dispose();}});sites.remove(child);}}
 function label(text){
  if(typeof document==='undefined')return new THREE.Group();
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');if(!ctx)return new THREE.Group();ctx.fillStyle='#09180fee';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#caff72';ctx.lineWidth=4;ctx.strokeRect(2,2,508,124);ctx.fillStyle='#eaffcd';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText(text.slice(0,30),256,70);const texture=new THREE.CanvasTexture(canvas),m=new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}),sprite=new THREE.Sprite(m);sprite.scale.set(9,2.25,1);return sprite;
 }
 function update(state,environment,position,time=0,{reducedMotion=false}={}){
  if(disposed)return;
  if(worldId!==environment?.id){worldId=environment?.id;signature=phaseKey='';clearSites();}
  const active=!!environment&&state&&!['idle','all-clear'].includes(state.phase);root.visible=active;if(!active){if(signature){signature='';clearSites();}root.userData.phase=state?.phase||'idle';return;}
  const nextPhaseKey=state.id+':'+state.phase;if(nextPhaseKey!==phaseKey){phaseKey=nextPhaseKey;phaseAt=time;}
  const presentationTime=state.presentationTime??state.currentServerTime;
  const age=Number.isFinite(presentationTime)&&Number.isFinite(state.phaseStartedAt)?Math.max(0,(presentationTime-state.phaseStartedAt)/1000):Number.isFinite(state.phaseElapsedMs)?Math.max(0,state.phaseElapsedMs/1000):Math.max(0,time-phaseAt);
  skyline.position.set(position.x,position.y,position.z);
  const phase=state.phase,detonation=phase==='detonation',fallout=phase==='fallout',warning=phase==='warning',recovery=phase==='recovery';
  const palette=warning?[0x78503b,0x171d29,.3]:detonation?[0xdc793d,0x4d2829,.78]:fallout?[0x879141,0x16221d,.75]:[0x496e60,0x172933,.4];
  atmosphere.uniforms.horizon.value.set(palette[0]);atmosphere.uniforms.zenith.value.set(palette[1]);atmosphere.uniforms.opacity.value=palette[2];
  if(detonation){const blend=clamp(age/7);atmosphere.uniforms.horizon.value.lerp(new THREE.Color(0x879141),blend);atmosphere.uniforms.zenith.value.lerp(new THREE.Color(0x16221d),blend);}
  root.userData.phase=phase;root.userData.phaseAge=age;root.userData.skyColor='#'+atmosphere.uniforms.horizon.value.getHexString();
  glow.color.set(fallout?0xa5bc52:detonation?0xffb655:warning?0xffb454:0x6eeec4);glow.opacity=fallout?.18:detonation?.2:.09;amber.opacity=fallout?.16:detonation?.28:.11;
  fire.opacity=reducedMotion?0:.6;wave.opacity=reducedMotion?0:.32;smoke.opacity=fallout?.34:.28;smoke.color.set(fallout?0x66734b:0x80653d);horizonGlow.color.copy(glow.color);
  for(const blast of blasts){
   const elapsed=detonation?Math.max(0,age-blast.index*1.6):fallout||recovery?10:0,progress=clamp(elapsed/5),emerged=elapsed>0;
   blast.root.visible=detonation||fallout||recovery;blast.root.userData.progress=progress;
   blast.ball.visible=detonation&&emerged&&elapsed<4.7&&!reducedMotion;blast.ball.scale.setScalar(2+22*Math.sin(clamp(elapsed/5)*Math.PI*.75));blast.ball.position.y=10+clamp(elapsed/5)*25;
   blast.shockwave.visible=detonation&&emerged&&elapsed<5&&!reducedMotion;blast.shockwave.scale.setScalar(2+elapsed*20);
   blast.cloud.visible=(emerged||reducedMotion)&&(detonation||fallout||recovery);blast.cloud.scale.setScalar(reducedMotion?.9:.15+progress*.85);blast.cloud.position.y=reducedMotion?0:progress*8;
  }
  dust.visible=fallout||recovery;dustMaterial.opacity=recovery?.28:.7;
  if(!reducedMotion&&dust.visible){for(let index=0;index<count;index++){particles[index*3+1]=(initialY[index]-time*(1.1+(index%5)*.17))%60;if(particles[index*3+1]<0)particles[index*3+1]+=60;}dustGeometry.attributes.position.needsUpdate=true;dust.position.x=Math.sin(time*.08)*3;}else dust.position.x=0;
  haze.rotation.y=reducedMotion?0:time*.008;
  const nextSignature=JSON.stringify([state.id,state.phase,state.objectives?.map(o=>[o.id,o.completed])]);
  if(signature!==nextSignature){signature=nextSignature;clearSites();for(const objective of state.objectives||[]){if(objective.completed||objective.phase!==state.phase)continue;const marker=new THREE.Group();marker.name='doomsday-objective-'+objective.id;marker.position.copy(objective.position);marker.userData.doomsdayObjective=objective.id;
   const beam=mesh(new THREE.CylinderGeometry(.12,.6,14,6),outline,marker,false);beam.position.y=7;
   const pad=mesh(new THREE.TorusGeometry(2,.1,6,32),outline,marker,false);pad.rotation.x=-Math.PI/2;pad.position.y=.12;
   const name=label(objective.name);name.position.y=4;marker.add(name);sites.add(marker);
  }}
 }
 return {root,update,reset(){root.visible=false;worldId=null;signature=phaseKey='';clearSites();},dispose(){if(disposed)return;disposed=true;clearSites();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.remove(root);}};
}
