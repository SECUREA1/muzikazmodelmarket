import * as T from '../vendor/three/three.module.min.js';
import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';

// Seeded botanical detail is shared by every instance of a species. Geometry
// stays independent of the server's tree identity and harvest lifecycle.
const seedFor=id=>[...id].reduce((seed,c)=>Math.imul(seed,31)+c.charCodeAt(0),17)>>>0;
function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function stemBetween(a,b,radius){
 const delta=b.clone().sub(a),mesh=new T.CylinderGeometry(radius*.32,radius,delta.length(),8,1,true);
 mesh.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));mesh.translate(...a.clone().add(b).multiplyScalar(.5).toArray());return mesh;
}
export function createForestTrunkGeometry(species){
 const h=species.height*.68,geometry=new T.CylinderGeometry(.14,.36,h,24,16,false),position=geometry.attributes.position,rnd=random(seedFor(species.id));
 for(let i=0;i<position.count;i++){
  const y=position.getY(i),t=(y+h/2)/h,angle=Math.atan2(position.getZ(i),position.getX(i));
  const flare=1+Math.pow(1-t,10)*.65+Math.sin(angle*7+.4)*.045+Math.sin(angle*13+t*8)*.027;
  position.setXYZ(i,position.getX(i)*flare+Math.sin(t*2.5)*.085,y,position.getZ(i)*flare+Math.sin(t*3.1)*.055);
 }
 geometry.computeVertexNormals();const parts=[geometry],conifer=['pine','cedar','spruce'].includes(species.id);
 for(let i=0;i<(conifer?30:17);i++){
  const t=conifer?.32+i/50:.45+rnd()*.48,angle=i*2.399963+rnd()*.5,reach=conifer?(1-t)*4.1+ .35:.8+rnd()*2.2;
  const from=new T.Vector3(0,(t-.5)*h,0),to=new T.Vector3(Math.cos(angle)*reach,from.y+(conifer?-.12:.55+rnd()),Math.sin(angle)*reach);
  parts.push(stemBetween(from,to,.035+(1-t)*.085));
  if(!conifer){const end=to.clone().add(new T.Vector3(Math.cos(angle+.5)*.65,.65,Math.sin(angle+.5)*.65));parts.push(stemBetween(to,end,.035));}
 }
 const result=mergeGeometries(parts);for(const part of parts)part.dispose();result.userData.forestryBotanicalGeometry='root-flare-and-branch-trunk';return result;
}
function card(positions,normals,uvs,center,width,height,yaw,pitch=0,roll=0){
 const rotation=new T.Euler(pitch,yaw,roll),normal=new T.Vector3(0,0,1).applyEuler(rotation),corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],order=[0,1,2,0,2,3];
 for(const index of order){const [x,y]=corners[index],p=new T.Vector3(x*width,y*height,0).applyEuler(rotation).add(center);positions.push(...p.toArray());normals.push(...normal.toArray());uvs.push(x+.5,y+.5);}
}
export function createForestCanopyGeometry(species,upper=false){
 const rnd=random(seedFor(species.id)+(upper?431:29)),positions=[],normals=[],uvs=[],conifer=['pine','cedar','spruce'].includes(species.id),height=species.height;
 if(conifer){
  const tiers=upper?5:7;
  for(let tier=0;tier<tiers;tier++){
   const t=tier/(tiers-1),radius=(upper?1.9:3.15)*(1-t*.79),y=(t-.48)*height*(upper?.32:.38),branches=upper?7:9;
   for(let branch=0;branch<branches;branch++){
    const angle=branch/branches*Math.PI*2+tier*1.17,reach=radius*(.78+rnd()*.3),center=new T.Vector3(Math.cos(angle)*reach*.55,y+(rnd()-.5)*.4,Math.sin(angle)*reach*.55);
    card(positions,normals,uvs,center,reach*1.7,upper?.85:1.3,angle+.5,Math.PI*.36+(rnd()-.5)*.3,(rnd()-.5)*.4);
    card(positions,normals,uvs,center,reach*1.45,upper?.9:1.15,angle+Math.PI/2,.2,(rnd()-.5)*.4);
   }
  }
 }else{
  const clusters=upper?13:25,radius=upper?2.25:3.35;
  for(let i=0;i<clusters;i++){
   const angle=i*2.399963,r=Math.sqrt((i+.5)/clusters)*radius,center=new T.Vector3(Math.cos(angle)*r,(rnd()-.45)*(upper?2.2:3.5),Math.sin(angle)*r),size=1.8+rnd()*.7;
   for(let cross=0;cross<3;cross++)card(positions,normals,uvs,center,size,size*.83,angle+cross*Math.PI/3,(rnd()-.5)*1.3,(rnd()-.5)*.75);
  }
 }
 const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(positions,3));result.setAttribute('normal',new T.Float32BufferAttribute(normals,3));result.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));result.computeBoundingSphere();result.userData.forestryBotanicalGeometry=conifer?'layered-needle-boughs':'clustered-broadleaf-sprays';return result;
}
export function createForestGroundCoverGeometry(){
 const positions=[],normals=[],uvs=[];
 for(let i=0;i<5;i++)card(positions,normals,uvs,new T.Vector3(0,.3,0),.75,.6,i*Math.PI/5,.3,Math.sin(i)*.2);
 const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(positions,3));result.setAttribute('normal',new T.Float32BufferAttribute(normals,3));result.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));return result;
}
