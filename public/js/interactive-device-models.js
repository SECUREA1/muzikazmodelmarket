import {INTERACTIVE_DEVICES} from './interactive-devices.js';
export function createInteractiveDevice(THREE,id){
 const profile=INTERACTIVE_DEVICES[id];if(!profile)return null;
 const root=new THREE.Group(),dark=new THREE.MeshStandardMaterial({color:0x17212c,roughness:.45,metalness:.35}),accent=new THREE.MeshStandardMaterial({color:profile.color,emissive:profile.color,emissiveIntensity:.25,roughness:.3}),glass=new THREE.MeshStandardMaterial({color:0x08111d,roughness:.22});
 const box=(size,position,material=dark)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;};
 const shape=profile.shape,wide=shape==='cinema',speaker=shape==='speaker'||shape==='jukebox',table=shape==='table'||shape==='deck';
 const width=wide?5:table?2.4:speaker?1.8:1.5,height=wide?3.3:table?1.2:speaker?1.3:2.2;
 box([width,.14,.9],[0,.07,0]);box([width*.92,height-.14,.6],[0,height/2+.07,.12]);
 if(table){box([width+.15,.12,1.3],[0,height,0],accent);for(const x of [-.7,.7]){const disc=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.035,24),glass);disc.position.set(x,height+.08,0);root.add(disc);}}
 else{const screen=box([width*.82,height*.56,.06],[0,height*.64,-.23],glass);screen.name='DEVICE_SCREEN';screen.userData.mediaScreen=true;box([width*.8,.12,.22],[0,height*.26,-.3],accent);}
 if(shape==='table'){const screen=box([1.2,.65,.08],[0,1.65,.45],glass);screen.name='DEVICE_SCREEN';screen.userData.mediaScreen=true;}
 if(speaker)for(const x of [-.5,.5]){const cone=new THREE.Mesh(new THREE.CylinderGeometry(.28,.3,.06,24),glass);cone.rotation.x=Math.PI/2;cone.position.set(x,.65,-.24);root.add(cone);}
 if(shape==='karaoke'){box([.08,2.6,.08],[1.05,1.3,0]);box([.28,.12,.16],[1.05,2.6,0],accent);}
 if(shape==='projector')box([.5,.3,.7],[.6,2.3,.1],accent);
 box([.1,height,.1],[-width/2+.06,height/2,0],accent);box([.1,height,.1],[width/2-.06,height/2,0],accent);
 // Decorative panels never participate in collision or change cabinet dimensions.
 if(typeof document!=='undefined'){
  const texture=new THREE.TextureLoader().load('/public/images/interactive-devices/'+id+'.svg',undefined,undefined,()=>{});texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});
  for(const side of [-1,1]){const poster=new THREE.Mesh(new THREE.PlaneGeometry(.58,height*.78),material);poster.position.set(side*(width*.5+.006),height*.53,.1);poster.rotation.y=side*Math.PI/2;poster.userData.collisionDisabled=true;poster.name='CABINET_ARTWORK';root.add(poster);}
 }
 root.name=profile.name;root.userData={modelId:id,builderObject:true,interactiveDevice:id,dimensions:[width,height,.9]};return root;
}
