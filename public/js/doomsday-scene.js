import * as THREE from '../vendor/three/three.module.min.js';

// Additive scenery leaves authored skies, weather, lights and map collision
// intact. The effect disappears completely when the room event ends.
export function createDoomsdayScene({scene,performanceMode=false}={}){
 const root=new THREE.Group();root.name='MUZIKAZ_DOOMSDAY_EVENT';root.visible=false;scene.add(root);
 const skyline=new THREE.Group(),sites=new THREE.Group();root.add(skyline,sites);
 const materials=[],geometries=[];
 const material=(color,opacity)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,toneMapped:false});materials.push(m);return m;};
 const glow=material(0x9bff45,.16),amber=material(0xffa12e,.18),outline=material(0x83ffd7,.5);
 const mesh=(geometry,m,parent,permanent=true)=>{if(permanent)geometries.push(geometry);const object=new THREE.Mesh(geometry,m);parent.add(object);return object;};
 const haze=mesh(new THREE.CylinderGeometry(220,220,80,performanceMode?24:48,1,true),glow,skyline);haze.position.y=15;
 for(let index=0;index<(performanceMode?18:32);index++){
  const angle=index*Math.PI*2/(performanceMode?18:32),height=10+(index*17%33);
  const tower=mesh(new THREE.BoxGeometry(7+(index%3)*3,height,7),index%3?glow:amber,skyline);
  tower.position.set(Math.sin(angle)*180,height/2-8,Math.cos(angle)*180);
 }
 // A stylised distant fallout cloud: broad cap and glowing dust column.
 const cloud=new THREE.Group();skyline.add(cloud);cloud.position.set(115,10,-150);
 const stem=mesh(new THREE.CylinderGeometry(7,16,48,12),amber,cloud);stem.position.y=24;
 const cap=mesh(new THREE.SphereGeometry(32,16,8),glow,cloud);cap.position.y=50;cap.scale.y=.4;
 const ring=mesh(new THREE.TorusGeometry(34,2,6,40),amber,cloud);ring.position.y=42;ring.rotation.x=Math.PI/2;
 const count=performanceMode?80:180,particles=new Float32Array(count*3);
 for(let i=0;i<count;i++){particles[i*3]=(i*37%140)-70;particles[i*3+1]=(i*19%60);particles[i*3+2]=(i*53%140)-70;}
 const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(particles,3));geometries.push(dustGeometry);
 const dustMaterial=new THREE.PointsMaterial({color:0xcaff72,size:.13,transparent:true,opacity:.65,depthWrite:false,fog:false});materials.push(dustMaterial);
 const dust=new THREE.Points(dustGeometry,dustMaterial);skyline.add(dust);
 let worldId=null,signature='';
 function clearSites(){for(const child of [...sites.children]){child.traverse(object=>{object.geometry?.dispose();if(object.material?.map){object.material.map.dispose();object.material.dispose();}});sites.remove(child);}}
 function label(text){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#09180fee';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#caff72';ctx.lineWidth=4;ctx.strokeRect(2,2,508,124);ctx.fillStyle='#eaffcd';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText(text.slice(0,30),256,70);const texture=new THREE.CanvasTexture(canvas);const m=new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true});const sprite=new THREE.Sprite(m);sprite.scale.set(9,2.25,1);return sprite;}
 function update(state,environment,position,time=0,{reducedMotion=false}={}){
  if(worldId!==environment?.id){worldId=environment?.id;signature='';clearSites();}
  const active=!!environment&&state&&!['idle','all-clear'].includes(state.phase);root.visible=active;if(!active){if(signature){signature='';clearSites();}return;}
  skyline.position.set(position.x,position.y,position.z);
  const fallout=state.phase==='fallout',warning=state.phase==='warning';
  glow.color.set(fallout?0x9bff45:warning?0xffb454:0x6eeec4);glow.opacity=fallout?.18:.09;amber.opacity=fallout?.22:.11;
  cloud.visible=fallout;dust.visible=fallout;dust.position.y=reducedMotion?0:-(time*1.4%20);haze.rotation.y=reducedMotion?0:time*.008;
  const nextSignature=JSON.stringify([state.id,state.phase,state.objectives?.map(o=>[o.id,o.completed])]);
  if(signature!==nextSignature){signature=nextSignature;clearSites();for(const objective of state.objectives||[]){if(objective.completed||objective.phase!==state.phase)continue;const marker=new THREE.Group();marker.name='doomsday-objective-'+objective.id;marker.position.copy(objective.position);marker.userData.doomsdayObjective=objective.id;
   const beam=mesh(new THREE.CylinderGeometry(.12,.6,14,6),outline,marker,false);beam.position.y=7;
   const pad=mesh(new THREE.TorusGeometry(2,.1,6,32),outline,marker,false);pad.rotation.x=-Math.PI/2;pad.position.y=.12;
   const name=label(objective.name);name.position.y=4;marker.add(name);sites.add(marker);
  }}
 }
 return {root,update,reset(){root.visible=false;worldId=null;signature='';clearSites();},dispose(){clearSites();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.remove(root);}};
}
