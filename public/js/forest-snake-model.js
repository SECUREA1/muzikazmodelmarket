import * as T from '../vendor/three/three.module.min.js';
import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import {finishNativeSurfaces} from './native-surface-finish.js';
import {FOREST_SNAKE_ITEMS} from './forest-snake-items.js';

const RINGS=64,SIDES=18,START=-5.15,LENGTH=11.85;
const rigs=new WeakMap(),surfaceSets=new Map();
const smooth=(a,b,t)=>a+(b-a)*t;
function scaleSurfaces(belly=false){
 if(surfaceSets.has(belly))return surfaceSets.get(belly);
 const size=512,albedo=new Uint8Array(size*size*4),relief=new Float32Array(size*size),roughness=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,row=Math.floor(v*(belly?24:48)),fx=(u*(belly?5:24)+(row%2)*.5)%1,fy=(v*(belly?24:48))%1;
  const rim=belly?Math.min(1,Math.min(fx,1-fx,fy,1-fy)*18):Math.pow(Math.max(0,1-Math.pow((fx-.5)*2,2)),.45)*Math.pow(Math.sin(fy*Math.PI),.42);
  const saddle=Math.sin(v*Math.PI*8+Math.sin(u*Math.PI*4)*1.4)*.5+.5,pepper=(Math.sin(x*17.13+y*3.7)*43758.5453)%1;
  const base=belly?[158,161,104]:[smooth(46,102,saddle),smooth(72,111,saddle),smooth(42,58,saddle)];
  const index=y*size+x,offset=index*4,shade=.61+rim*.39+(pepper*.024);
  for(let c=0;c<3;c++)albedo[offset+c]=Math.round(Math.min(255,base[c]*shade));albedo[offset+3]=255;
  relief[index]=rim*(belly?.22:.42);const r=Math.round((belly?.74:.51+rim*.16)*255);roughness.set([r,r,r,255],offset);
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const at=(x,y)=>relief[((y+size)%size)*size+(x+size)%size],dx=(at(x+1,y)-at(x-1,y))*2.6,dy=(at(x,y+1)-at(x,y-1))*2.6,length=Math.hypot(dx,dy,1),offset=(y*size+x)*4;
  normal.set([Math.round((-dx/length+1)*127.5),Math.round((dy/length+1)*127.5),Math.round((1/length+1)*127.5),255],offset);
 }
 const values=[albedo,normal,roughness].map((pixels,index)=>{
  const texture=new T.DataTexture(pixels,size,size,T.RGBAFormat);texture.name='MOSSBACK_'+(belly?'BELLY':'SCALES')+['_ALBEDO','_NORMAL','_ROUGHNESS'][index];texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.colorSpace=index===0?T.SRGBColorSpace:T.NoColorSpace;texture.userData={nativeSurfaceShared:true,forestSnakeSurface:true,resolution:size};texture.needsUpdate=true;return texture;
 });
 const result={map:values[0],normalMap:values[1],roughnessMap:values[2]};surfaceSets.set(belly,result);return result;
}
function skin(belly=false){
 const material=new T.MeshStandardMaterial({color:0xffffff,roughness:belly?.74:.54,metalness:.03,...scaleSurfaces(belly)});material.name=belly?'MOSSBACK_VENTRAL_SCALES':'MOSSBACK_EMERALD_SCALES';material.normalScale.set(.55,.55);material.userData={nativeMaterialDesign:'forest-snake-v1',forestSnakeScales:true};return material;
}
function radiusAt(t){return t<.18?smooth(.29,.48,Math.sin(t/.18*Math.PI/2)):smooth(.48,.018,Math.pow((t-.18)/.82,1.7));}
function pathAt(t,phase){const amplitude=.26+Math.sin(t*Math.PI)*.68;return Math.sin(phase-t*7.1)*amplitude;}
function bodyGeometry(){
 const geometry=new T.BufferGeometry(),positions=new Float32Array((RINGS+1)*(SIDES+1)*3),normals=new Float32Array(positions.length),uv=new Float32Array((RINGS+1)*(SIDES+1)*2),indices=[];
 for(let ring=0;ring<=RINGS;ring++)for(let side=0;side<=SIDES;side++){const index=ring*(SIDES+1)+side;uv[index*2]=side/SIDES;uv[index*2+1]=ring/RINGS*3.8;}
 // Ventral plates have their own lighter PBR surface. Groups remain stable as
 // the shared body topology deforms; only its position and normal buffers move.
 for(let ring=0;ring<RINGS;ring++)for(let side=0;side<SIDES;side++){
  const a=ring*(SIDES+1)+side,b=a+SIDES+1,offset=indices.length;indices.push(a,b,a+1,b,b+1,a+1);geometry.addGroup(offset,6,Math.sin((side+.5)/SIDES*Math.PI*2)<-.48?1:0);
 }
 // Gather dorsal and ventral indices into two batches for the entire body.
 const dorsal=[],ventral=[];for(const group of geometry.groups)(group.materialIndex?ventral:dorsal).push(...indices.slice(group.start,group.start+group.count));indices.length=0;indices.push(...dorsal,...ventral);geometry.clearGroups();geometry.addGroup(0,dorsal.length,0);geometry.addGroup(dorsal.length,ventral.length,1);
 geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('normal',new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setIndex(indices);geometry.userData.forestSnakeBody=true;return geometry;
}
function animateBody(geometry,phase){
 const positions=geometry.attributes.position,normals=geometry.attributes.normal;
 for(let ring=0;ring<=RINGS;ring++){
  const t=ring/RINGS,radius=radiusAt(t),x=pathAt(t,phase),z=START+t*LENGTH,epsilon=.0001,derivative=(pathAt(t+epsilon,phase)-pathAt(t-epsilon,phase))/(2*epsilon*LENGTH),length=Math.hypot(1,derivative),nx=1/length,nz=-derivative/length;
  for(let side=0;side<=SIDES;side++){
   const theta=side/SIDES*Math.PI*2,c=Math.cos(theta),s=Math.sin(theta),index=ring*(SIDES+1)+side,normalLength=Math.hypot(c,s/.82);
   positions.setXYZ(index,x+nx*radius*c,.025+radius*.82+radius*.82*s,z+nz*radius*c);
   normals.setXYZ(index,nx*c/normalLength,(s/.82)/normalLength,nz*c/normalLength);
  }
 }
 positions.needsUpdate=true;normals.needsUpdate=true;
 // Known conservative envelope avoids rescanning all vertices each frame.
 if(!geometry.boundingSphere)geometry.boundingSphere=new T.Sphere(new T.Vector3(0,.5,.7),7.2);
 if(!geometry.boundingBox)geometry.boundingBox=new T.Box3(new T.Vector3(-1.35,.02,-5.5),new T.Vector3(1.35,1.1,6.75));
}
function mergedMesh(name,parts,material,parent){const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.userData.collisionDisabled=true;mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function spheres(points,radius,scale=[1,1,1]){return points.map(point=>new T.SphereGeometry(radius,18,12).scale(...scale).translate(...point));}

export function createForestSnakeModel(id='timberland-snake'){
 if(!FOREST_SNAKE_ITEMS[id])return null;
 const root=new T.Group();root.name='Mossback · Wandering Forest Snake';root.userData={builderObject:true,modelId:id,forestSnakeModel:true,dimensions:FOREST_SNAKE_ITEMS[id].dimensions,forestSnakeRig:{body:'MOSSBACK_BODY',head:'MOSSBACK_HEAD_RIG',jaw:'MOSSBACK_JAW_RIG',tongue:'MOSSBACK_FORKED_TONGUE',length:13.2,rings:RINGS,sides:SIDES}};
 const back=skin(),belly=skin(true),body=new T.Mesh(bodyGeometry(),[back,belly]);body.name='MOSSBACK_BODY';body.castShadow=body.receiveShadow=true;root.add(body);animateBody(body.geometry,0);
 const head=new T.Group();head.name='MOSSBACK_HEAD_RIG';root.add(head);
 const upperGeometry=new T.SphereGeometry(1,28,18);const p=upperGeometry.attributes.position;for(let i=0;i<p.count;i++){if(p.getY(i)<-.15)p.setY(i,-.15+(p.getY(i)+.15)*.22);const z=p.getZ(i);if(z<0)p.setX(i,p.getX(i)*(.72+.28*(1+z)));}upperGeometry.computeVertexNormals();
 const upper=new T.Mesh(upperGeometry,back);upper.name='MOSSBACK_SHAPED_HEAD';upper.scale.set(.61,.33,.92);upper.castShadow=upper.receiveShadow=true;head.add(upper);
 const jaw=new T.Group();jaw.name='MOSSBACK_JAW_RIG';jaw.position.set(0,-.085,.35);head.add(jaw);
 const lower=new T.Mesh(new T.SphereGeometry(1,28,14),belly);lower.name='MOSSBACK_LOWER_JAW';lower.scale.set(.49,.12,.77);lower.position.set(0,-.05,-.34);lower.castShadow=lower.receiveShadow=true;jaw.add(lower);
 const gold=new T.MeshStandardMaterial({color:0xe4b34d,roughness:.28,metalness:.22}),black=new T.MeshStandardMaterial({color:0x111a0e,roughness:.37}),glint=new T.MeshBasicMaterial({color:0xfff4d0}),tongueMaterial=new T.MeshStandardMaterial({color:0xad4a48,roughness:.53});
 const eyes=[[-.51,.1,-.32],[.51,.1,-.32]];mergedMesh('MOSSBACK_GOLDEN_EYES',spheres(eyes,.11,[.55,1,1]),gold,head);
 mergedMesh('MOSSBACK_SLIT_PUPILS',spheres([[-.57,.105,-.33],[.57,.105,-.33]],1,[.018,.078,.025]),black,head);
 mergedMesh('MOSSBACK_EYE_CATCHLIGHTS',spheres([[-.583,.143,-.353],[.583,.143,-.353]],.016),glint,head);
 mergedMesh('MOSSBACK_NOSTRILS',spheres([[-.18,.025,-.824],[.18,.025,-.824]],1,[.035,.018,.014]),black,head);
 const mouthParts=[];for(const side of [-1,1]){const curve=new T.CatmullRomCurve3([new T.Vector3(side*.03,-.11,-.9),new T.Vector3(side*.35,-.14,-.63),new T.Vector3(side*.54,-.12,-.1),new T.Vector3(side*.44,-.08,.4)]);mouthParts.push(new T.TubeGeometry(curve,18,.012,5,false));}mergedMesh('MOSSBACK_SMILE_LINE',mouthParts,black,head);
 const tongue=new T.Group();tongue.name='MOSSBACK_FORKED_TONGUE';tongue.position.set(0,-.05,-1.03);jaw.add(tongue);
 const tongues=[[[0,0,0],[0,0,-.4]],[[-.005,0,-.37],[-.12,.015,-.6]],[[.005,0,-.37],[.12,.015,-.6]]].map(([a,b])=>new T.TubeGeometry(new T.LineCurve3(new T.Vector3(...a),new T.Vector3(...b)),1,.018,6,false));mergedMesh('MOSSBACK_TONGUE_SURFACE',tongues,tongueMaterial,tongue);
 root.traverse(node=>{if(node.isMesh){node.userData.collisionDisabled=true;node.userData.builderRoot=root;}});
 finishNativeSurfaces(T,root,'forest-snake');installSpeech(root,head);rigs.set(root,{body,head,jaw,tongue});updateForestSnakeModel(root,0);root.updateMatrixWorld(true);return root;
}


function installSpeech(root,head){
 if(typeof document==='undefined'||!head||root.userData.setSnakeSpeech)return;
 head.getObjectByName('MOSSBACK_SPEECH_BUBBLE')?.removeFromParent();
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=320;const context=canvas.getContext('2d');if(!context)return;
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.name='MOSSBACK_SPEECH_CANVAS';
 const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:true,depthWrite:false,toneMapped:false}));sprite.name='MOSSBACK_SPEECH_BUBBLE';sprite.scale.set(8,2.5,1);sprite.position.set(0,2.2,0);sprite.visible=false;sprite.userData={collisionDisabled:true,collider:false,mediaScreen:true};head.add(sprite);
 let last='';
 root.userData.setSnakeSpeech=value=>{
  const message=String(value||'').slice(0,220);root.userData.forestSnakeTalking=!!message;if(message===last)return;last=message;sprite.visible=!!message;if(!message)return;
  const words=message.split(/\s+/),lines=[];let line='';context.font='600 42px system-ui,sans-serif';
  for(const word of words){const next=line?line+' '+word:word;if(context.measureText(next).width>920&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
  context.clearRect(0,0,1024,320);context.fillStyle='#edf2df';context.strokeStyle='#294c37';context.lineWidth=8;
  context.beginPath();context.moveTo(30,8);context.lineTo(994,8);context.quadraticCurveTo(1016,8,1016,30);context.lineTo(1016,269);context.quadraticCurveTo(1016,291,994,291);context.lineTo(542,291);context.lineTo(512,317);context.lineTo(482,291);context.lineTo(30,291);context.quadraticCurveTo(8,291,8,269);context.lineTo(8,30);context.quadraticCurveTo(8,8,30,8);context.fill();context.stroke();
  context.fillStyle='#37533a';context.font='bold 32px system-ui,sans-serif';context.textAlign='left';context.fillText('MOSSBACK',48,54);context.fillStyle='#172c20';context.font='600 42px system-ui,sans-serif';
  lines.slice(0,4).forEach((text,index)=>context.fillText(text,48,110+index*49,928));texture.needsUpdate=true;
 };
}

/** Pose only local geometry; the room renderer owns the model's world transform. */
export function updateForestSnakeModel(root,elapsed=0,{talking=root?.userData?.forestSnakeTalking===true,reducedMotion=false}={}){
 if(!root?.userData?.forestSnakeModel)return false;
 let rig=rigs.get(root);if(!rig){const body=root.getObjectByName('MOSSBACK_BODY');if(!body)return false;body.geometry=body.geometry.clone();rig={body,head:root.getObjectByName('MOSSBACK_HEAD_RIG'),jaw:root.getObjectByName('MOSSBACK_JAW_RIG'),tongue:root.getObjectByName('MOSSBACK_FORKED_TONGUE')};rigs.set(root,rig);installSpeech(root,rig.head);}
 const time=Number.isFinite(elapsed)?elapsed:0,phase=reducedMotion?0:time*1.65;
 animateBody(rig.body.geometry,phase);
 rig.head.position.set(pathAt(0,phase),.57,START-.36);
 const derivative=(pathAt(.001,phase)-pathAt(0,phase))/(LENGTH*.001);rig.head.rotation.set(0,Math.atan(derivative),reducedMotion?0:Math.sin(time*.8)*.018);
 rig.jaw.rotation.x=talking?-(reducedMotion?.08:.075+Math.sin(time*8.4)*.055):0;
 rig.tongue.visible=!reducedMotion&&(talking||Math.sin(time*.9)>.985);
 rig.tongue.scale.z=.68+(Math.sin(time*18)+1)*.16;
 return true;
}
