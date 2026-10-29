// Small shared humanoid hinges. Continuous limbs retain one draw each; real
// GPU skinning bends at the midpoint without a second sleeve/trouser mesh.
const rigs=new WeakMap();
const limbGeometryCache=new WeakMap();
const paletteGeometryCache=new WeakMap();
const conversationalGesture=/talk|explain|listen|think|thought|work|serve|pass|deal|count|roll|practice|practise|play/;
const wavingGesture=/wave|greet|cheer/;
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const nameFor=(prefix,kind,side,suffix)=>`${prefix}_${kind.toUpperCase()}_${side<0?'LEFT':'RIGHT'}_${suffix}`;

function hingeGeometry(T,source){
 const p=source.parameters;let geometry;
 if(source.type==='CapsuleGeometry'&&p){
  const r=p.radius,h=p.length/2,s=Math.SQRT1_2;
  geometry=new T.LatheGeometry([[0,-h-r],[r*s,-h-r*s],[r,-h],[r,0],[r,h],[r*s,h+r*s],[0,h+r]].map(([x,y])=>new T.Vector2(x,y)),8);
 }else if(source.type==='CylinderGeometry'&&p){
  geometry=new T.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,Math.min(6,p.radialSegments||6),Math.max(2,p.heightSegments||1),p.openEnded,p.thetaStart,p.thetaLength);
 }else if(source.type==='BoxGeometry'&&p){
  geometry=new T.BoxGeometry(p.width,p.height,p.depth,1,2,1);
 }else geometry=source.clone();
 // A finished skinned box must keep its joint ring and skin attributes.
 geometry.type='BufferGeometry';delete geometry.parameters;return geometry;
}

/** Coordinates are in the existing shoulder/hip group's local space. Existing
 * hands/shoes go under `end`; separate lower-arm/shin meshes use `lowerParts`.
 * Mesh identity changes, while its name/material, rest pose and draw count stay.
 */
export function articulateLimb(T,joint,{mesh=null,bend=[0,-.25,0],end=[0,-.5,0],attachments=[],lowerParts=[],kind='arm',side=1,prefix='CHARACTER',forward=-1}={}){
 if(!joint?.isObject3D)throw new TypeError('A limb requires an existing joint group.');
 const bendNode=mesh?new T.Bone():new T.Group(),endNode=new T.Group();
 bendNode.name=nameFor(prefix,kind,side,'BEND');endNode.name=nameFor(prefix,kind,side,'END');
 bendNode.position.set(...bend);endNode.position.set(end[0]-bend[0],end[1]-bend[1],end[2]-bend[2]);bendNode.add(endNode);
 let skin=null;
 if(mesh){
  mesh.updateMatrix();const geometryKey=mesh.matrix.elements.join(',')+'|'+bend.join(',');let cache=limbGeometryCache.get(mesh.geometry);if(!cache){cache=new Map();limbGeometryCache.set(mesh.geometry,cache);}let geometry=cache.get(geometryKey);
  if(!geometry){geometry=hingeGeometry(T,mesh.geometry);geometry.applyMatrix4(mesh.matrix);
  const positions=geometry.attributes.position,indices=[],weights=[],span=Math.max(.015,Math.abs(bend[1])*.1);
  for(let i=0;i<positions.count;i++){
   const weight=clamp((bend[1]+span-positions.getY(i))/(span*2),0,1);
   indices.push(0,1,0,0);weights.push(1-weight,weight,0,0);
  }
  const packedWeights=[];for(let i=0;i<weights.length;i+=4){const upper=Math.round(weights[i]*255);packedWeights.push(upper,255-upper,0,0);}
  geometry.setAttribute('skinIndex',new T.Uint8BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Uint8BufferAttribute(packedWeights,4,true));cache.set(geometryKey,geometry);}
  skin=new T.SkinnedMesh(geometry,mesh.material);skin.name=mesh.name;skin.userData={...mesh.userData,articulatedSkin:true};skin.castShadow=mesh.castShadow;skin.receiveShadow=mesh.receiveShadow;skin.visible=mesh.visible;skin.renderOrder=mesh.renderOrder;
  const rootBone=new T.Bone();rootBone.name=nameFor(prefix,kind,side,'BASE');rootBone.add(bendNode);skin.add(rootBone);joint.add(skin);
  const skeleton=new T.Skeleton([rootBone,bendNode]);joint.updateWorldMatrix(true,true);skin.bind(skeleton);skin.normalizeSkinWeights();
  // Animated bounds are deliberately fixed: limbs bend inside the old relaxed
  // character envelope, avoiding per-frame vertex bounds scans.
  geometry.computeBoundingBox();geometry.computeBoundingSphere();skin.boundingBox=geometry.boundingBox.clone();skin.boundingSphere=geometry.boundingSphere.clone();skin.boundingSphere.radius+=Math.abs(end[1]-bend[1]);
  mesh.removeFromParent();
 }else joint.add(bendNode);
 joint.updateWorldMatrix(true,true);
 for(const part of lowerParts)if(part?.isObject3D&&part!==mesh)bendNode.attach(part);
 for(const part of attachments)if(part?.isObject3D&&part!==mesh)endNode.attach(part);
 joint.userData.articulatedLimb={kind,side:side<0?-1:1,forward:forward>0?1:-1,bendName:bendNode.name,endName:endNode.name,restX:joint.rotation.x,restY:joint.rotation.y,restZ:joint.rotation.z};
 return {joint,bend:bendNode,end:endNode,mesh:skin};
}

/** A humanoid shares one tiny bone palette across its four limb draws. This
 * avoids a separate GPU texture allocation/upload for each elbow and knee. */
export function finalizeArticulatedCharacter(root){
 const meshes=[];root.traverse(node=>{if(node.isSkinnedMesh&&node.userData.articulatedSkin)meshes.push(node);});
 const palettes=new Set(meshes.map(mesh=>mesh.skeleton));if(palettes.size<2)return root;
 const first=meshes[0].skeleton,bones=[],inverses=[];for(const skeleton of palettes){bones.push(...skeleton.bones);inverses.push(...skeleton.boneInverses);}
 const skeleton=new first.constructor(bones,inverses);let offset=0;
 for(const old of palettes){
  for(const mesh of meshes)if(mesh.skeleton===old){
   let geometries=paletteGeometryCache.get(mesh.geometry);if(!geometries){geometries=new Map();paletteGeometryCache.set(mesh.geometry,geometries);}let geometry=geometries.get(offset);
   if(!geometry){geometry=mesh.geometry.clone();const previous=geometry.attributes.skinIndex,array=new Uint8Array(previous.array.length);for(let i=0;i<array.length;i++)array[i]=previous.array[i]+offset;geometry.setAttribute('skinIndex',new previous.constructor(array,4));geometries.set(offset,geometry);}
   mesh.geometry=geometry;mesh.bind(skeleton,mesh.bindMatrix);
  }
  offset+=old.bones.length;old.dispose();
 }
 return root;
}

function rigFor(root){
 let rig=rigs.get(root);if(rig)return rig;
 finalizeArticulatedCharacter(root);
 const nodes=[],byName=new Map(),limbs=[],hips=[];root.traverse(node=>{nodes.push(node);if(node.name)byName.set(node.name,node);});
 for(const node of nodes){
  const data=node.userData.articulatedLimb;
  if(data){const bend=byName.get(data.bendName),end=byName.get(data.endName);if(bend&&end)limbs.push({joint:node,bend,end,...data});}
  if(node.userData.articulatedHips)hips.push({node,x:node.rotation.x,y:node.rotation.y,z:node.rotation.z});
 }
 rig={limbs,hips};rigs.set(root,rig);return rig;
}

/** O(articulated joints), no frame traversal, geometry writes or allocation.
 * upperBody:false adds elbows/knees/ankles after an existing gesture controller.
 */
export function updateArticulatedCharacter(root,time,{moving=false,speed=1,gesture='',reducedMotion=false,upperBody=true}={}){
 if(!root?.isObject3D)return false;
 const rig=rigFor(root);if(!rig.limbs.length)return false;
 const t=finite(time),motion=reducedMotion?0:1,walking=Boolean(moving)&&motion>0,pace=clamp(finite(speed,1),.25,2),phase=t*(pace>1.35?8:6),stride=walking?Math.sin(phase):0,talking=conversationalGesture.test(gesture),wave=wavingGesture.test(gesture);
 for(const limb of rig.limbs){
  const {joint,bend,end,kind,side,restX,restY,restZ}=limb,step=stride*side,forward=limb.forward||-1;
  if(upperBody){joint.rotation.set(restX,restY,restZ);if(walking)joint.rotation.x=restX+step*(kind==='arm'?.32:-.4)*forward*Math.min(1.5,pace);}
  if(kind==='leg'){
   bend.rotation.x=walking?forward*Math.max(0,-step)*.68:0;
   // The ankle counters the shin during swing, then levels the planted foot.
   end.rotation.x=walking?-joint.rotation.x-bend.rotation.x+Math.max(0,-step)*.1:0;
   end.rotation.z=0;
  }else{
   const reach=Math.abs(joint.rotation.x-restX);
   bend.rotation.x=-forward*(walking?.18+Math.max(0,-step)*.35:wave?.55:talking?.35+Math.min(.75,reach*.42):.06*motion);
   end.rotation.x=wave?Math.sin(t*5)*.13*motion:talking?-forward*.08:0;
   end.rotation.z=wave?side*Math.sin(t*6)*.16*motion:0;
  }
 }
 if(upperBody)for(const hips of rig.hips){hips.node.rotation.y=hips.y+stride*.025;hips.node.rotation.z=hips.z+stride*.018;}
 return true;
}

/** Minimal shared fallback for players without an authored avatar. One colored
 * mesh (222 triangles), one skeleton, no image maps, lights or asset requests.
 */
export function createArticulatedPlayer(T,{color=0x63eaff,height=1.8}={}){
 const root=new T.Group();root.name='ARTICULATED_PLAYER';root.userData.articulatedPlayer=true;
 const bones=[],positions=[],colors=[],skinIndices=[],skinWeights=[],vertexIndices=[];
 const material=new T.MeshStandardMaterial({color:0xffffff,roughness:.8,metalness:.04,vertexColors:true,flatShading:true});
 const bone=(name,parent,position)=>{const node=new T.Bone();node.name=name;node.position.set(...position);if(parent)parent.add(node);bones.push(node);return node;};
 const hips=bone('PLAYER_HIPS',null,[0,.84,0]);hips.userData.articulatedHips=true;
 const add=(geometry,boneNode,position,colorValue)=>{
  const geo=geometry.index?geometry.toNonIndexed():geometry,p=geo.attributes.position,c=new T.Color(colorValue),index=bones.indexOf(boneNode),local=new Map();
  for(let i=0;i<p.count;i++){const x=p.getX(i)+position[0],y=p.getY(i)+position[1],z=p.getZ(i)+position[2],key=[x,y,z].join(',');let vertex=local.get(key);if(vertex===undefined){vertex=positions.length/3;local.set(key,vertex);positions.push(x,y,z);colors.push(Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255));skinIndices.push(index,0,0,0);skinWeights.push(255,0,0,0);}vertexIndices.push(vertex);}if(geo!==geometry)geo.dispose();geometry.dispose();
 };
 add(new T.BoxGeometry(.38,.48,.24),hips,[0,1.14,0],color);add(new T.BoxGeometry(.35,.16,.25),hips,[0,.84,0],0x25364b);
 add(new T.OctahedronGeometry(.205,1),hips,[0,1.59,0],0xd2a17d);
 for(const side of [-1,1]){
  add(new T.PlaneGeometry(.032,.018).rotateY(Math.PI),hips,[side*.065,1.63,-.198],0x172734);
  add(new T.PlaneGeometry(.046,.007).rotateY(Math.PI),hips,[side*.065,1.66,-.187],0x574333);
 }
 add(new T.PlaneGeometry(.06,.008).rotateY(Math.PI),hips,[0,1.54,-.198],0x785046);
 add(new T.BoxGeometry(.033,.041,.033),hips,[0,1.595,-.2],0xc29070);
 for(const side of [-1,1]){
  for(const kind of ['arm','leg']){
   const arm=kind==='arm',x=side*(arm?.265:.115),y=arm?1.34:.81,length=arm?.25:.365;
   const upper=bone(nameFor('PLAYER',kind,side,'BASE'),hips,[x,y-.84,0]),bend=bone(nameFor('PLAYER',kind,side,'BEND'),upper,[0,-length,0]),end=bone(nameFor('PLAYER',kind,side,'END'),bend,[0,-length,0]);
   upper.userData.articulatedLimb={kind,side,bendName:bend.name,endName:end.name,restX:0,restY:0,restZ:0};
   const width=arm?.105:.14;add(new T.BoxGeometry(width,length+.025,width),upper,[x,y-length/2,0],arm?color:0x25364b);add(new T.BoxGeometry(width*.9,length+.02,width*.9),bend,[x,y-length*1.5,0],arm?0xd2a17d:0x25364b);
   add(new T.BoxGeometry(arm?.11:.17,arm?.11:.1,arm?.12:.28),end,[x,y-length*2-(arm?.025:.025),arm?0:-.05],arm?0xd2a17d:0x182635);
  }
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Uint8BufferAttribute(colors,3,true));geometry.setAttribute('skinIndex',new T.Uint8BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new T.Uint8BufferAttribute(skinWeights,4,true));geometry.setIndex(vertexIndices);
 const mesh=new T.SkinnedMesh(geometry,material);mesh.name='PLAYER_ARTICULATED_BODY';mesh.add(hips);root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton(bones));geometry.computeBoundingSphere();mesh.boundingSphere=geometry.boundingSphere.clone();mesh.boundingSphere.radius+=.3;mesh.castShadow=mesh.receiveShadow=true;
 root.scale.setScalar(clamp(finite(height,1.8),.5,3)/1.8);return root;
}
