// Original MUZIKAZ team uniforms. These are hollow, sleeveless garments rather
// than avatar replacements, so an equipped player's chosen avatar stays visible.
export const BASKETBALL_JERSEYS = Object.freeze({
  home: Object.freeze({name:'Home',color:0x087f8c,trim:0xfff5df,accent:0xb9ff38,number:'24'}),
  away: Object.freeze({name:'Away',color:0xb73550,trim:0xffffff,accent:0xffbc66,number:'08'})
});
const validTeam=team=>Object.hasOwn(BASKETBALL_JERSEYS,team);

function shirtShape(THREE,back=false){
  const shape=new THREE.Shape();
  shape.moveTo(-.5,-.5);shape.lineTo(.5,-.5);shape.lineTo(.5,.08);
  shape.bezierCurveTo(.35,.12,.3,.31,.35,.5);shape.lineTo(.18,.5);
  shape.quadraticCurveTo(.14,back?.4:.24,0,back?.39:.22);
  shape.quadraticCurveTo(-.14,back?.4:.24,-.18,.5);shape.lineTo(-.35,.5);
  shape.bezierCurveTo(-.3,.31,-.35,.12,-.5,.08);shape.closePath();
  return shape;
}

function jerseyTexture(THREE,team,back,number){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=640;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const kit=BASKETBALL_JERSEYS[team],hex=value=>'#'+value.toString(16).padStart(6,'0');
  ctx.fillStyle=hex(kit.color);ctx.fillRect(0,0,512,640);
  // A fine, regular knit stays subtle under arena lighting.
  ctx.fillStyle='rgba(255,255,255,.065)';
  for(let y=0;y<640;y+=12)for(let x=(y%24?3:9);x<512;x+=12)ctx.fillRect(x,y,2,3);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=hex(kit.trim);
  ctx.font='900 46px system-ui, sans-serif';ctx.fillText(back?kit.name.toUpperCase():'MUZIKAZ',256,back?205:226);
  ctx.font='900 238px system-ui, sans-serif';ctx.lineWidth=9;ctx.strokeStyle=hex(kit.accent);
  ctx.strokeText(number||kit.number,256,402);ctx.fillText(number||kit.number,256,402);
  ctx.font='800 17px system-ui, sans-serif';ctx.fillText('COURTSIDE ATHLETICS',256,570);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export function createBasketballJersey(THREE,team='home',number=null){
  if(!validTeam(team))throw new Error('Choose a home or away basketball jersey.');
  const kit=BASKETBALL_JERSEYS[team],root=new THREE.Group();root.name='Basketball_Jersey_'+team;
  root.userData={basketballJersey:true,team,attachmentSocket:'torso',dimensions:[.72,.73,.45]};
  const fabric=new THREE.MeshStandardMaterial({color:kit.color,roughness:.95,metalness:0,side:THREE.DoubleSide});
  const trim=new THREE.MeshStandardMaterial({color:kit.trim,roughness:.85,side:THREE.DoubleSide});
  const accent=new THREE.MeshStandardMaterial({color:kit.accent,roughness:.8,side:THREE.DoubleSide});
  for(const back of [false,true]){
    const geometry=new THREE.ShapeGeometry(shirtShape(THREE,back),12);
    // ShapeGeometry's planar UVs use the shape coordinates directly.
    const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)+.5,uv.getY(i)+.5);
    const texture=jerseyTexture(THREE,team,back,number);
    const cloth=texture?new THREE.MeshStandardMaterial({map:texture,roughness:.95,side:THREE.DoubleSide}):fabric;
    const panel=new THREE.Mesh(geometry,cloth);panel.position.z=back?.225:-.225;
    panel.scale.set(.72,.73,1);if(!back)panel.rotation.y=Math.PI;
    panel.name=back?'Jersey_Back':'Jersey_Front';root.add(panel);
    // Collar and armhole piping follows the garment's cut, with open arm holes.
    const points=shirtShape(THREE,back).getPoints(18).map(p=>new THREE.Vector3(p.x*.72,p.y*.73,panel.position.z)),path=new THREE.CurvePath();
    for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(points[i-1],points[i]));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(path,points.length,.009,5,false),trim));
  }
  for(const side of [-1,1]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(.45,.424),fabric);
    panel.position.set(side*.36,-.153,0);panel.rotation.y=Math.PI/2;panel.name='Jersey_Side';root.add(panel);
    const stripe=new THREE.Mesh(new THREE.PlaneGeometry(.028,.414),accent);
    stripe.position.set(side*.362,-.153,0);stripe.rotation.y=Math.PI/2;root.add(stripe);
    const shoulder=new THREE.Mesh(new THREE.PlaneGeometry(.122,.45),fabric);
    shoulder.position.set(side*.19,.365,0);shoulder.rotation.x=Math.PI/2;root.add(shoulder);
  }
  root.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;part.userData.collisionDisabled=true;}});
  return root;
}

function visibleAvatarBounds(THREE,root){
  root.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3(),inverse=root.matrixWorld.clone().invert();
  root.traverse(part=>{
    if(!part.isMesh||!part.geometry)return;
    for(let node=part;node&&node!==root;node=node.parent)if(!node.visible||node.userData.basketballJersey)return;
    if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();
    if(part.geometry.boundingBox)bounds.union(part.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(part.matrixWorld)));
  });
  if(bounds.isEmpty())bounds.set(new THREE.Vector3(-.32,0,-.22),new THREE.Vector3(.32,1.8,.22));
  return bounds;
}

function disposeJersey(jersey){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  jersey.traverse(part=>{if(part.geometry)geometries.add(part.geometry);for(const material of Array.isArray(part.material)?part.material:[part.material])if(material){materials.add(material);if(material.map)textures.add(material.map);}});
  geometries.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());
  jersey.removeFromParent();
}

// Call after the avatar model loads, or when a player's replicated jersey changes.
// The identity check also detects when an asynchronous avatar load replaced a body.
export function setBasketballJersey(THREE,root,team,options={}){
  if(!root)return null;
  if(team!=null&&!validTeam(team))return null;
  const previous=root.userData.basketballJerseyAttachment;
  const body=options.body||root.userData.serverAvatarModel||root.userData.serverAvatar||root.userData.avatarModel||root;
  const identity=options.identity||body;
  if(previous&&previous.userData.team===team&&previous.userData.avatarIdentity===identity&&previous.parent)return previous;
  if(previous){disposeJersey(previous);delete root.userData.basketballJerseyAttachment;}
  if(!team)return null;
  const bounds=visibleAvatarBounds(THREE,body),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const height=Math.max(.5,size.y),width=options.width||THREE.MathUtils.clamp(size.x*.82,height*.36,height*.56),depth=options.depth||THREE.MathUtils.clamp(size.z*.82,height*.23,height*.4);
  const jersey=createBasketballJersey(THREE,team,options.number);
  jersey.position.set(center.x,bounds.min.y+height*.635,center.z);
  jersey.scale.set(width/.72,(options.height||height*.405)/.73,depth/.45);
  if(options.rotationY)jersey.rotation.y=options.rotationY;
  body.add(jersey);body.updateWorldMatrix(true,true);
  // Preserve the fitted world transform when using an animated torso socket.
  // Bone attachment lets a player's existing walk animation move the uniform.
  let torso=null;
  body.traverse(part=>{if(part.isBone&&/^(?:mixamorig:?|bip\d*[_ :]?)?(?:upperchest|chest|spine2|spine_02|spine\.002)$/i.test(part.name))torso=part;});
  if(torso)torso.attach(jersey);
  jersey.userData.avatarIdentity=identity;
  root.userData.basketballJerseyAttachment=jersey;
  return jersey;
}
