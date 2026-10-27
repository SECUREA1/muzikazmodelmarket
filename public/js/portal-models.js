import * as THREE from '../vendor/three/three.module.min.js';
import {finishGameItem} from './game-item-finish.js';

// The original identities keep saved maps and owned Backpack copies compatible.
export const PORTAL_MODEL_INFO = Object.freeze({
 'portal-door':['Glowing Portal Door','Machined alloy gateway with a violet vortex, luminous edge rails and a reinforced threshold.',[1.5,2.5,.5]],
 'teleport-pad':['Teleport Pad','Low-profile transport disc with concentric energy channels, segmented plating and an animated core.',[2.2,.2,2.2]],
 'portal-arch':['Runic Portal Arch','Carved stone gateway with brass rune inlays and a flowing turquoise energy veil.',[2.4,3.2,.7]],
 'portal-ring':['Solar Portal Ring','Freestanding circular gateway with titanium housings, amber emitters and a swirling solar aperture.',[2.8,3,.8]]
});
export const PORTAL_ITEMS = Object.entries(PORTAL_MODEL_INFO).map(([id,[name,description,dimensions]])=>({
 id,name,description,dimensions,type:'interactive',category:'interactive',behavior:'door',procedural:true,assetKind:'premade',size:82,
 color:id==='portal-ring'?'#ffc76b':id==='portal-arch'?'#54eadb':'#a78bfa',image:`public/images/native-upgrades/${id}.svg`,animation:'portal-flow',
 // New gateways expose the existing destination tuner without choosing a map
 // or changing the action saved on existing portal-door / teleport-pad copies.
 ...(['portal-arch','portal-ring'].includes(id)?{action:'teleport',function_data:{action:'teleport',prompt:'Use portal',portal:{enabled:false,destinationType:'location',targetObjectId:'',targetMapId:''}}}:{})
}));

const standard=(color,roughness=.45,metalness=.6,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const luminous=color=>standard(color,.25,.2,{emissive:color,emissiveIntensity:2.1});
function part(root,name,geometry,material,position=[0,0,0],rotation=[0,0,0],effect=false){
 const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);
 if(effect){mesh.userData.collisionDisabled=true;mesh.userData.portalEffect=true;mesh.castShadow=false;}
 root.add(mesh);return mesh;
}
const block=(root,name,size,mat,pos,rot)=>part(root,name,new THREE.BoxGeometry(...size),mat,pos,rot);
const ring=(root,name,radius,tube,mat,pos,rot,arc=Math.PI*2)=>part(root,name,new THREE.TorusGeometry(radius,tube,8,64,arc),mat,pos,rot);

// Self-lit energy has its own soft halo, so it stays readable with bloom off.
// One draw call per aperture; no per-item lights, textures or particle emitters.
function aperture(root,size,color,pos,rotation=[0,0,0],round=false){
 const material=new THREE.ShaderMaterial({
  uniforms:{time:{value:0},tint:{value:new THREE.Color(color)},roundField:{value:round?1:0}},
  transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`
   uniform float time; uniform vec3 tint; uniform float roundField; varying vec2 vUv;
   void main(){
    vec2 p=(vUv-.5)*2.; float radius=length(p),angle=atan(p.y,p.x);
    float edge=mix(max(abs(p.x),abs(p.y)),radius,roundField);
    float mask=1.-smoothstep(.89,1.,edge);
    float spiral=.5+.5*sin(angle*4.-radius*15.+time*1.35);
    float eddies=.5+.5*sin(p.x*13.+sin(p.y*9.+time)*2.-time*.8);
    float rim=exp(-abs(edge-.87)*35.);
    float core=exp(-radius*radius*5.);
    float energy=.08+spiral*.15+eddies*.06+rim*.75+core*.12;
    vec3 glow=mix(tint,vec3(.83,.96,1.),rim*.7+core*.2);
    gl_FragColor=vec4(glow*energy*1.8,mask*(.48+rim*.45));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 return part(root,'PORTAL_ENERGY_VEIL',new THREE.PlaneGeometry(...size),material,pos,rotation,true);
}

function door(root){
 const alloy=standard(0x354052,.32,.82),dark=standard(0x121a29,.63,.45),trim=standard(0xa6b3c8,.28,.83),glow=luminous(0xb496ff);
 block(root,'PORTAL_THRESHOLD',[1.5,.12,.5],dark,[0,.06,0]);
 block(root,'PORTAL_CROWN',[1.5,.18,.4],alloy,[0,2.41,0]);
 for(const side of [-1,1]){
  block(root,'PORTAL_COLUMN',[.18,2.3,.36],alloy,[side*.66,1.27,0]);
  for(const z of [-.195,.195]){
   block(root,'PORTAL_EDGE_RAIL',[.035,2.08,.025],glow,[side*.565,1.26,z]);
   for(let i=0;i<4;i++)block(root,'PORTAL_RAIL_BRACKET',[.18,.045,.035],trim,[side*.66,.38+i*.53,z]);
  }
  for(const y of [.26,2.24])block(root,'PORTAL_CORNER_ARMOR',[.25,.28,.43],dark,[side*.625,y,0]);
 }
 for(const z of [-.22,.22]){
  block(root,'PORTAL_STATUS_LIGHT',[.32,.035,.018],glow,[0,2.42,z]);
  for(const x of [-.42,.42])for(const y of [.065,2.41])part(root,'PORTAL_FASTENER',new THREE.CylinderGeometry(.025,.025,.018,6),trim,[x,y,z],[Math.PI/2,0,0]);
 }
 aperture(root,[1.08,2.18],0x9772ff,[0,1.27,0]);
 // Retain the original closed-door collision surface; the energy is cosmetic.
 const collider=part(root,'PORTAL_COLLIDER',new THREE.PlaneGeometry(1.08,2.18),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),[0,1.27,0]);
 collider.visible=false;collider.userData.collider=true;collider.userData.collisionOnly=true;
}

function pad(root){
 const dark=standard(0x172130,.52,.7),metal=standard(0x657589,.3,.83),glow=luminous(0xa689ff);
 part(root,'TRANSPORT_BASE',new THREE.CylinderGeometry(1.1,1.07,.12,64),dark,[0,.06,0]);
 part(root,'TRANSPORT_DECK',new THREE.CylinderGeometry(.98,1.03,.05,64),metal,[0,.145,0]);
 part(root,'TRANSPORT_CORE',new THREE.CylinderGeometry(.7,.7,.025,48),dark,[0,.1825,0]);
 for(const r of [.73,.91])ring(root,'TRANSPORT_LIGHT_CHANNEL',r,.012,glow,[0,.184,0],[Math.PI/2,0,0]);
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6;
  block(root,'TRANSPORT_RADIAL_PLATE',[.11,.025,.16],dark,[Math.sin(a)*.835,.183,Math.cos(a)*.835],[0,a,0]);
  if(i%3===0)block(root,'TRANSPORT_GUIDE_LIGHT',[.055,.012,.12],glow,[Math.sin(a)*.835,.194,Math.cos(a)*.835],[0,a,0]);
 }
 aperture(root,[1.38,1.38],0x9572ff,[0,.199,0],[-Math.PI/2,0,0],true);
}

function arch(root){
 const stone=standard(0x4e6969,.93,.03),cap=standard(0x304b4f,.88,.05),brass=standard(0xb2a071,.4,.76),glow=luminous(0x63f1d9);
 for(const side of [-1,1]){
  block(root,'RUNIC_FOOTING',[.58,.22,.7],cap,[side*.9,.11,0]);
  for(let i=0;i<5;i++){
   block(root,'CARVED_STONE_BLOCK',[.42,.32,.52],stone,[side*.91,.4+i*.34,0]);
   for(const z of [-.269,.269]){
    block(root,'RUNE_INLAY',[.032,.14,.012],glow,[side*.91,.4+i*.34,z],[0,0,i%2?.5:-.5]);
    block(root,'RUNE_INLAY',[.11,.022,.012],brass,[side*.91,.4+i*.34,z]);
   }
  }
 }
 for(let i=0;i<11;i++){
  const angle=i/10*Math.PI;
  block(root,'ARCH_VOUSSOIR',[.34,.43,.52],i===5?cap:stone,[Math.cos(angle)*.91,1.98+Math.sin(angle)*.91,0],[0,0,angle-Math.PI/2]);
 }
 for(const z of [-.285,.285]){
  ring(root,'ARCH_ENERGY_CREST',.705,.022,glow,[0,1.98,z],[0,0,0],Math.PI);
  for(const side of [-1,1])block(root,'ARCH_ENERGY_RAIL',[.035,1.74,.028],glow,[side*.705,1.11,z]);
 }
 // Arched veil geometry follows the inner opening rather than a rectangle.
 const field=aperture(root,[1.38,2.52],0x35cdbb,[0,1.47,0]);
 const shape=new THREE.Shape();shape.moveTo(-.69,-1.26);shape.lineTo(.69,-1.26);shape.lineTo(.69,.51);shape.absarc(0,.51,.69,0,Math.PI,false);shape.lineTo(-.69,-1.26);
 field.geometry.dispose();field.geometry=new THREE.ShapeGeometry(shape,32);
 // ShapeGeometry UVs are model coordinates; the shader expects 0..1.
 const uv=field.geometry.attributes.uv,pos=field.geometry.attributes.position;
 for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/1.38+.5,pos.getY(i)/2.52+.5);
}

function solar(root){
 const alloy=standard(0x627080,.3,.84),dark=standard(0x1b2431,.56,.66),gold=standard(0xbf9052,.32,.76),glow=luminous(0xffbb55);
 block(root,'SOLAR_PLINTH',[2.1,.16,.8],dark,[0,.08,0]);
 for(const side of [-1,1])block(root,'SOLAR_SUPPORT',[.26,.72,.54],alloy,[side*.82,.46,0],[0,0,side*.24]);
 ring(root,'SOLAR_OUTER_HOUSING',1.22,.18,alloy,[0,1.58,0]);
 for(const z of [-.17,.17]){
  ring(root,'SOLAR_INNER_EMITTER',1.025,.024,glow,[0,1.58,z]);
  ring(root,'SOLAR_FACE_TRIM',1.27,.025,gold,[0,1.58,z]);
  for(let i=0;i<12;i++){
   const a=i*Math.PI/6;
   block(root,'SOLAR_SEGMENT_CLAMP',[.16,.28,.12],dark,[Math.sin(a)*1.23,1.58+Math.cos(a)*1.23,z],[0,0,-a]);
   block(root,'SOLAR_EMITTER',[.055,.11,.015],glow,[Math.sin(a)*1.22,1.58+Math.cos(a)*1.22,z+Math.sign(z)*.066],[0,0,-a]);
  }
 }
 aperture(root,[2.02,2.02],0xffad45,[0,1.58,0],[0,0,0],true);
}

export function createPortalModel(id){
 const info=PORTAL_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group();({ 'portal-door':door,'teleport-pad':pad,'portal-arch':arch,'portal-ring':solar })[id](root);
 root.name=info[0];root.userData={builderObject:true,portalModel:true,modelId:id,label:info[0],description:info[1],dimensions:info[2],behavior:'door',interactive:true,animated:true};
 root.traverse(node=>{if(node.isMesh){node.userData.builderRoot=root;node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;}});
 return finishGameItem(THREE,root);
}

export function updatePortalModel(root,elapsed){
 if(!root.userData.portalModel||root.userData.animationState?.enabled===false)return;
 const speed=Number(root.userData.animationState?.speed??1),time=(Number.isFinite(elapsed)?elapsed:0)*(Number.isFinite(speed)?Math.max(0,speed):1);
 root.traverse(node=>{if(node.userData.portalEffect&&node.material.uniforms?.time)node.material.uniforms.time.value=time;});
}
