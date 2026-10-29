import * as THREE from '../vendor/three/three.module.min.js';
import {finishGameItem} from './game-item-finish.js';

// Authored metre-scale replacements share the original scenery identities.
export const CRAFTED_LANDSCAPE_MODEL_INFO=Object.freeze({
 'terrain-cliff':['Weathered Cliff','Layered sandstone escarpment with fractured ledges, moss seams and fallen scree.',[4.8,3.2,3.5]],
 'terrain-river':['River Bend','A curved clear-water channel between shaped earthen banks, reeds and rounded river stones.',[6,.2,3]],
 'terrain-crater':['Impact Crater','A scorched impact bowl with a raised fractured rim, mineral seams and scattered ejecta.',[5,.8,5]],
 'terrain-snowbank':['Snow Bank','Sculpted snow drifts with swept crests, cool blue ice facets and granular edge rocks.',[4,1.2,2.4]],
 'ancient-oak':['Ancient Oak','A broad branching oak with flared roots, ridged bark and a layered spreading crown.',[4.5,6,4.5]],
 'palm-cluster':['Palm Cluster','Three curved ringed palm trunks with hand-shaped pinnate fronds and hanging coconuts.',[3.5,5,3.5]],
 'giant-mushrooms':['Giant Mushrooms','A grove of rose-capped mushrooms with real gills, pale stem collars and softly luminous spots.',[2.4,2.2,2]],
 'desert-cactus':['Desert Cactus','A ribbed saguaro with curved upright arms, clustered spines and a coral desert blossom.',[1.5,3,1.2]]
});
const colors={'terrain-cliff':'#8b7965','terrain-river':'#43a3bc','terrain-crater':'#756454','terrain-snowbank':'#d5ecf3','ancient-oak':'#4d8550','palm-cluster':'#43a86a','giant-mushrooms':'#d976a7','desert-cactus':'#6ca373'};
export const CRAFTED_LANDSCAPE_ITEMS=Object.freeze(Object.entries(CRAFTED_LANDSCAPE_MODEL_INFO).map(([id,[name,description,dimensions]])=>({
 id,buildAssetId:id,name,description,dimensions,type:'landscape',category:id.startsWith('terrain-')?'terrain':'plants',behavior:'decor',color:colors[id],image:`public/images/native-upgrades/${id}.svg`,animation:'crafted-idle',procedural:true,assetKind:'premade',size:80,function_data:{behavior:'decor',action:'none'}
})));

const mat=(color,roughness=.9,metalness=.02,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
function part(root,name,geometry,material,position=[0,0,0],rotation=[0,0,0]){
 const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);root.add(mesh);return mesh;
}
function rock(root,name,position,scale,material,detail=0){
 const mesh=part(root,name,new THREE.IcosahedronGeometry(1,detail),material,position);mesh.scale.set(...scale);mesh.rotation.set(.18,.7+position[0]*.37,.12);return mesh;
}
function branch(root,name,points,radius,material){
 return part(root,name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(10,points.length*5),radius,7,false),material);
}
function tapered(root,name,start,end,bottom,top,material){
 const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),mesh=part(root,name,new THREE.CylinderGeometry(top,bottom,a.distanceTo(b),10),material,a.clone().add(b).multiplyScalar(.5).toArray());
 mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());return mesh;
}
function graded(geometry,bottom,top){
 const g=geometry.clone(),p=g.attributes.position,lo=new THREE.Color(bottom),hi=new THREE.Color(top),data=[];let min=Infinity,max=-Infinity;
 for(let i=0;i<p.count;i++){min=Math.min(min,p.getY(i));max=Math.max(max,p.getY(i));}
 for(let i=0;i<p.count;i++){const t=THREE.MathUtils.clamp((p.getY(i)-min)/Math.max(.001,max-min)+(Math.sin(i*7.1)+1)*.035,0,1),c=lo.clone().lerp(hi,t);data.push(c.r,c.g,c.b);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(data,3));return g;
}
const vertexMat=(extra={})=>mat(0xffffff,.92,.02,{vertexColors:true,...extra});
function terrainSurfaceUvs(geometry,planar=false){
 geometry.computeBoundingBox();const p=geometry.attributes.position,n=geometry.attributes.normal,bounds=geometry.boundingBox,size=bounds.getSize(new THREE.Vector3()),uv=[];
 for(let i=0;i<p.count;i++){
  const axis=planar?1:[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))].indexOf(Math.max(Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i)))),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];
  for(const a of axes)uv.push((p.getComponent(i,a)-bounds.min.getComponent(a))/Math.max(.000001,size.getComponent(a)));
 }
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return geometry;
}
function removeCollapsedTerrainFaces(geometry){
 const p=geometry.attributes.position,index=geometry.index,clean=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<(index?.count||p.count);i+=3){
  const vertices=[0,1,2].map(j=>index?index.getX(i+j):i+j);a.fromBufferAttribute(p,vertices[0]);b.fromBufferAttribute(p,vertices[1]);c.fromBufferAttribute(p,vertices[2]);
  if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-18)clean.push(...vertices);
 }
 // These ice facets have one material; the cone generator's old side/cap
 // ranges must not point past the compacted triangle index.
 geometry.setIndex(clean);geometry.clearGroups();return geometry;
}
function loft(root,name,rings,material,{capBottom=false,capTop=true}={}){
 const positions=[],n=rings[0].length;
 const triangle=(a,b,c)=>positions.push(...a,...b,...c);
 for(let row=0;row<rings.length-1;row++)for(let i=0;i<n;i++){
  const next=(i+1)%n;triangle(rings[row][i],rings[row][next],rings[row+1][i]);triangle(rings[row][next],rings[row+1][next],rings[row+1][i]);
 }
 for(const [ring,enabled,top]of [[rings[0],capBottom,false],[rings.at(-1),capTop,true]]){
  if(!enabled)continue;const center=ring.reduce((sum,p)=>sum.add(new THREE.Vector3(...p)),new THREE.Vector3()).multiplyScalar(1/n).toArray();
  for(let i=0;i<n;i++)if(top)triangle(ring[i],ring[(i+1)%n],center);else triangle(ring[i],center,ring[(i+1)%n]);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
 return part(root,name,terrainSurfaceUvs(geometry),material);
}

function cliff(root){
 const stone=[mat(0x6b6259),mat(0x93816b),mat(0xa09177),mat(0x827563)],moss=mat(0x5c7350),scree=mat(0x887b6b);
 const n=11,outline=Array.from({length:n},(_,i)=>{const a=-i/n*Math.PI*2,r=1+Math.sin(i*2.7)*.1;return [Math.cos(a)*2.18*r,Math.sin(a)*1.49*r];});
 const layers=[];let boundary=null;
 for(let layer=0;layer<4;layer++){
  const low=layer*.72,high=low+.76,shrink=1-layer*.075;
  // A sediment boundary belongs to both adjacent layers. Independent height
  // noise formerly opened gaps and left upper shelves visibly unsupported.
  const lower=boundary||outline.map(([x,z])=>[x*shrink,low,z*shrink]);
  const upper=outline.map(([x,z],i)=>[x*(shrink-.04)+Math.sin(i+layer)*.08,high+Math.sin(i*1.7+layer)*.14,z*(shrink-.03)]);
  layers.push(loft(root,'CLIFF_SEDIMENT_LAYER',[lower,upper],stone[layer],{capBottom:layer===0,capTop:layer===3}));boundary=upper;
 }
 for(let i=0;i<10;i++){
  const a=i/10*Math.PI*2,x=Math.cos(a)*2.03,z=Math.sin(a)*1.48,s=.15+(i%3)*.08;
  rock(root,'FALLEN_SCREE',[x,.12,z],[s,s*.64,s*.83],scree);
 }
 for(let i=0;i<6;i++)rock(root,'CLIFF_MOSS_PATCH',[(i-2.5)*.48,2.9+Math.sin(i)*.04,Math.sin(i*2)*.72],[.45,.045,.32],moss,1);
 root.updateMatrixWorld(true);const ray=new THREE.Raycaster(),forward=new THREE.Vector3(0,0,1);
 for(let i=0;i<5;i++){
  const x=-1.5+i*.7,path=new THREE.CatmullRomCurve3([[x,.85,-1.23],[x+.09,1.1,-1.2],[x+.05,1.42,-1.18]].map(p=>new THREE.Vector3(...p))),points=[];
  // Mineral exposure follows the actual tapered face, including each shared
  // sediment boundary, rather than hanging at one arbitrary front Z plane.
  for(let j=0;j<=12;j++){const point=path.getPoint(j/12);ray.set(new THREE.Vector3(point.x,point.y,-4),forward);const hit=ray.intersectObjects(layers,false)[0];if(hit)point.z=hit.point.z-.004;points.push(point);}
  part(root,'CLIFF_MINERAL_SEAM',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.016,7,false),stone[2]);
 }
}

function river(root){
 const bank=mat(0x637153),sand=mat(0x9e9a78),pebble=mat(0x74868a),reed=mat(0x52784f),water=mat(0x348fa9,.22,.15,{transparent:true,opacity:.86,emissive:0x163f4b,emissiveIntensity:.12,side:THREE.DoubleSide});
 const center=x=>Math.sin(x*.72)*.47;
 // Curved ribbons describe the actual bank and channel rather than a box slab.
 function ribbon(name,inner,outer,height,material){
  const points=[],steps=32;
  for(let i=0;i<=steps;i++){const x=-3+i/steps*6;points.push([x,height,center(x)+inner]);}
  for(let i=steps;i>=0;i--){const x=-3+i/steps*6;points.push([x,height,center(x)+outer]);}
  const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[2]))),g=new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false,steps:1});
  return part(root,name,g,material,[0,height-.06,0],[-Math.PI/2,0,0]);
 }
 ribbon('RIVER_BED',-.94,.94,.065,sand);
 ribbon('LEFT_RIVER_BANK',-.97,-.67,.11,bank);ribbon('RIGHT_RIVER_BANK',.67,.97,.11,bank);
 const field=ribbon('CURVED_WATER_CHANNEL',-.68,.68,.09,water);field.userData.collisionDisabled=true;field.userData.landscapeWater={base:.86};
 const foam=mat(0xa7d4d8,.45,.02,{transparent:true,opacity:.53});
 for(let i=0;i<6;i++){
  const x=-2.45+i*.87,z=center(x)+(i%2?-.27:.24),ripple=branch(root,'WATER_CURRENT_GLINT',[[x-.2,.103,z],[x,.104,z-.025],[x+.21,.103,z+.01]],.008,foam);
  ripple.userData.collisionDisabled=true;ripple.userData.landscapeWater={base:.53,phase:i};
 }
 for(let i=0;i<14;i++){
  const x=-2.75+(i%7)*.9,z=center(x)+(i<7?-.78:.78),s=.065+(i%3)*.025;
  rock(root,'RIVER_BANK_PEBBLE',[x,.13,z],[s*1.5,s*.7,s],pebble,1);
 }
 for(const x of [-2.1,1.8])for(const side of [-1,1])for(let i=0;i<3;i++){
  const z=center(x)+side*.91;
  tapered(root,'RIVER_REED',[x+i*.035,.1,z],[x+i*.045,.28+(i%2)*.07,z+side*.055],.009,.003,reed);
 }
}

function crater(root){
 const soil=mat(0x75604f),dark=mat(0x382f2b),rim=mat(0x97836a),mineral=mat(0xb4a184),n=56,positions=[],colors=[];
 const rings=[[2.45,0],[2.2,.35],[1.73,.72],[1.43,.49],[.95,.18],[.28,.07],[0,.065]],palette=[0x67584b,0x8d7760,0x9b856c,0x65503f,0x3e342d,0x322c28,0x322c28];
 function point(row,i){const a=-i/n*Math.PI*2,[r,y]=rings[row],noise=row===0||row===6?0:Math.sin(i*1.9)*.055;return [Math.cos(a)*r*(1+noise),y+noise*.5,Math.sin(a)*r*(1+noise)];}
 for(let row=0;row<rings.length-2;row++)for(let i=0;i<n;i++){
  const quad=[point(row,i),point(row,(i+1)%n),point(row+1,i),point(row+1,(i+1)%n)],c0=new THREE.Color(palette[row]),c1=new THREE.Color(palette[row+1]);
  for(const index of [0,1,2,1,3,2]){positions.push(...quad[index]);const c=index<2?c0:c1;colors.push(c.r,c.g,c.b);}
 }
 // One fan reaches the floor centre. A collapsed zero-radius quad ring used
 // to emit a second, zero-area triangle at every one of its56 segments.
 for(let i=0;i<n;i++)for(const vertex of [point(rings.length-2,i),point(rings.length-2,(i+1)%n),[0,rings.at(-1)[1],0]]){
  positions.push(...vertex);const color=new THREE.Color(palette.at(-1));colors.push(color.r,color.g,color.b);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();part(root,'FRACTURED_IMPACT_BOWL',terrainSurfaceUvs(geometry,true),vertexMat({side:THREE.DoubleSide}));
 for(let i=0;i<15;i++){
  const a=i/15*Math.PI*2,r=i%3===0?2.25:1.75,s=.13+(i%3)*.045;
  rock(root,'CRATER_EJECTA',[Math.cos(a)*r,r>2?.17:.63,Math.sin(a)*r],[s*1.5,s*.65,s],i%3===0?soil:rim);
 }
 for(let i=0;i<6;i++){
  const a=i/6*Math.PI*2;branch(root,'EXPOSED_MINERAL_VEIN',[[Math.cos(a)*1.54,.54,Math.sin(a)*1.54],[Math.cos(a+.03)*1.68,.71,Math.sin(a+.03)*1.68],[Math.cos(a+.05)*1.9,.6,Math.sin(a+.05)*1.9]],.012,mineral);
 }
 rock(root,'SCORCHED_IMPACT_REMNANT',[.08,.13,-.12],[.25,.16,.22],dark,1);
}

function snow(root){
 const snow=vertexMat(),ice=mat(0x85b5d3,.22,.18,{transparent:true,opacity:.85}),rockMat=mat(0x748994);
 const drifts=[[-.8,.12,1.18,.82],[.48,.02,1.32,1.16],[1.36,.09,.67,.48],[-1.42,-.12,.62,.42]];
 for(const [x,z,r,height]of drifts){
  const geometry=graded(new THREE.SphereGeometry(r,28,12,0,Math.PI*2,0,Math.PI/2),0xb5d0df,0xf2fbff),drift=part(root,'SCULPTED_SNOW_DRIFT',geometry,snow,[x,0,z]);drift.scale.set(1,height/r,.72);
 }
 const crest=mat(0xf7fdff);
 const crestPoints=[[-1.55,.29,-.28],[-.9,.77,-.28],[-.35,.96,-.22],[.3,1.15,-.16],[.93,.99,-.1]];
 branch(root,'WINDSWEPT_DRIFT_CREST',crestPoints,.025,crest);
 // The narrow swept ridge joins the crest to the overlapping snow lobes.
 // Its outer edges are buried in the existing drifts, so it creates neither
 // a hovering tube nor another disconnected slab along the snow surface.
 const crestCurve=new THREE.CatmullRomCurve3(crestPoints.map(p=>new THREE.Vector3(...p))),positions=[],indices=[],uv=[],steps=48;
 const snowHeight=(x,z)=>Math.max(0,...drifts.map(([cx,cz,r,h])=>h*Math.sqrt(Math.max(0,1-((x-cx)/r)**2-((z-cz)/(r*.72))**2))));
 for(let row=0;row<=steps;row++){
  const t=row/steps,p=crestCurve.getPoint(t),tangent=crestCurve.getTangent(t),cross=new THREE.Vector3(-tangent.z,0,tangent.x).normalize(),lift=Math.max(0,p.y-snowHeight(p.x,p.z));
  for(let j=0;j<5;j++){
   const u=(j-2)/2,x=p.x+cross.x*u*.16,z=p.z+cross.z*u*.16,weight=(1-Math.abs(u))**1.6,y=snowHeight(x,z)-.03+weight*(lift+.018);
   positions.push(x,y,z);uv.push(t,j/4);
  }
 }
 for(let row=0;row<steps;row++)for(let j=0;j<4;j++){const a=row*5+j,b=a+5;indices.push(a,a+1,b,b,a+1,b+1);}
 const ridgeGeometry=new THREE.BufferGeometry();ridgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ridgeGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));ridgeGeometry.setIndex(indices);ridgeGeometry.computeVertexNormals();
 const ridge=part(root,'GROUNDED_WINDSWEPT_SNOW_RIDGE',graded(ridgeGeometry,0xc7e0ed,0xf2fbff),snow);ridge.userData.collisionDisabled=true;ridge.userData.collider=false;
 for(let i=0;i<6;i++){
  const shard=part(root,'BLUE_ICE_FACET',removeCollapsedTerrainFaces(new THREE.ConeGeometry(.1+(i%2)*.035,.37,4)),ice,[-1.3+i*.46,.13,-.62]);shard.rotation.set(.4,Math.PI/4,i%2?.18:-.13);shard.scale.z=.55;
 }
 for(let i=0;i<5;i++)rock(root,'SNOW_EDGE_STONE',[-1.5+i*.71,.045,.68],[.11,.07,.09],rockMat);
}

function oak(root){
 const bark=mat(0x624333),furrow=mat(0x412d26),heart=mat(0x94704b),leaves=vertexMat({roughness:.84});
 const trunk=[[0,0,0],[-.12,1.15,.03],[.06,2.3,-.04],[.28,3.55,.02]];
 branch(root,'AGED_OAK_TRUNK',trunk,.34,bark);
 for(let i=0;i<7;i++){
  const a=i/7*Math.PI*2;
  branch(root,'FLARED_OAK_ROOT',[[Math.cos(a)*1.03,.04,Math.sin(a)*.94],[Math.cos(a)*.6,.14,Math.sin(a)*.55],[Math.cos(a)*.2,.58,Math.sin(a)*.21]],.14,bark);
 }
 for(let i=0;i<9;i++){
  const a=i/9*Math.PI*2,r=.34;
  branch(root,'VERTICAL_BARK_FURROW',[[Math.cos(a)*r,.18,Math.sin(a)*r],[Math.cos(a)*r-.11,1.15,Math.sin(a)*r+.03],[Math.cos(a)*r+.04,2.2,Math.sin(a)*r-.04]],.016,furrow);
 }
 const arms=[[-1.3,4,-.45],[1.4,4.25,.38],[-.65,4.4,1.15],[.35,4.8,-1.1],[.1,5.05,.12]];
 for(let i=0;i<arms.length;i++){
  const end=arms[i];tapered(root,'SPREADING_OAK_LIMB',[.04,2.45+i*.11,0],end,.2,.07,bark);
  const tip=[end[0]*1.18,end[1]+.34,end[2]*1.2];tapered(root,'OAK_FINE_BRANCH',end,tip,.075,.025,heart);
 }
 const foliage=new THREE.Group();foliage.name='LAYERED_OAK_CROWN';foliage.position.set(0,3.7,0);foliage.userData.landscapeSway={axis:'z',base:0,amplitude:.008,phase:.5};root.add(foliage);
 for(let i=0;i<13;i++){
  const a=i/8*Math.PI*2,r=i<8?1.25:.55,y=i<8?.55:1.2+(i%2)*.2;
  const geometry=graded(new THREE.IcosahedronGeometry(.92,2),i%3?0x31563a:0x3c663e,i%2?0x6e9d52:0x85ad63),crown=part(foliage,'OAK_LEAF_MASS',geometry,leaves,[Math.cos(a)*r,y,Math.sin(a)*r]);crown.scale.set(1.06,.82,.97);crown.rotation.y=a;
 }
 // A branch knot gives the trunk an identifiable crafted detail.
 part(root,'OAK_BRANCH_KNOT',new THREE.TorusGeometry(.14,.036,8,20),heart,[-.05,1.6,-.338],[.1,0,.2]);
}

function palmFrond(root,length,width,material,angle,tilt,index){
 const pivot=new THREE.Group();pivot.rotation.set(tilt,angle,0);pivot.userData.landscapeSway={axis:'z',base:0,amplitude:.024,phase:index*.6};root.add(pivot);
 const points=[],positions=[];
 const center=t=>[t*length,.22*Math.sin(t*Math.PI)-t*t*.38,0];
 for(let i=0;i<=16;i++)points.push(center(i/16));
 branch(pivot,'PALM_FROND_RACHIS',points,.014,material);
 for(let i=1;i<12;i++){
  const t=i/12,[x,y]=center(t),spread=Math.sin(t*Math.PI)*width;
  for(const side of [-1,1])positions.push(x-.06,y,0,x+.22,y-.025,side*spread,x+.13,y+.008,side*.025);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();part(pivot,'PINNATE_PALM_FROND',geo,material);
}
function palms(root){
 const bark=mat(0x9b7951),rings=mat(0x6b543c),coconut=mat(0x5b422d),leaf=mat(0x3b8a50,.78,.01,{side:THREE.DoubleSide}),leafLight=mat(0x69a25b,.82,.01,{side:THREE.DoubleSide});
 for(let tree=0;tree<3;tree++){
  const x=(tree-1)*.45,z=tree===1?.32:-.1,h=tree===1?4.4:3.65+tree*.12,lean=(tree-1)*.18;
  branch(root,'CURVED_PALM_TRUNK',[[x,0,z],[x+lean*.1,h*.35,z-.05],[x+lean*.45,h*.7,z-.13],[x+lean,h,z]],.12,bark);
  for(let i=0;i<13;i++){
   const t=i/13,cx=x+lean*t*t,cz=z-Math.sin(t*Math.PI)*.12;
   part(root,'PALM_TRUNK_GROWTH_RING',new THREE.TorusGeometry(.122,.012,5,12),rings,[cx,.12+t*(h-.14),cz],[Math.PI/2,0,-lean*.15]);
  }
  const crown=new THREE.Group();crown.position.set(x+lean,h,z);root.add(crown);
  for(let i=0;i<8;i++)palmFrond(crown,1.08,.38,i%3?leaf:leafLight,i/8*Math.PI*2,i%2?.13:-.08,i+tree*3);
  for(let i=0;i<3;i++)rock(crown,'HANGING_COCONUT',[Math.cos(i*2.1)*.16,-.16,Math.sin(i*2.1)*.16],[.105,.14,.105],coconut,1);
 }
}

function mushrooms(root){
 const stem=mat(0xd8c6a5),gills=mat(0xa79587),capMat=vertexMat({roughness:.66}),spotMat=mat(0xffd8e9,.55,.03,{emissive:0xff9ac7,emissiveIntensity:.1}),moss=mat(0x58765b);
 for(const [index,x,z,h,r]of [[0,-.56,.16,1.34,.47],[1,.25,-.16,2.15,.66],[2,.77,.38,.96,.36]]){
  const grove=new THREE.Group();grove.position.set(x,0,z);grove.userData.landscapeSway={axis:'z',base:0,amplitude:.009,phase:index*1.2};root.add(grove);
  const stemHeight=h-r*.43;branch(grove,'MUSHROOM_STEM',[[0,.02,0],[-.04,stemHeight*.46,.03],[.035,stemHeight,0]],r*.17,stem);
  const profile=[[0,r*.43],[r*.28,r*.4],[r*.67,r*.24],[r,.025],[r*.96,-.045],[r*.68,-.095],[r*.2,-.06],[0,-.045]].map(p=>new THREE.Vector2(...p));
  // Lathe profiles run from the underside toward the crown so the cap's
  // exterior normals hide the authored gills from a view above the mushroom.
  part(grove,'ROSE_MUSHROOM_CAP',graded(new THREE.LatheGeometry(profile.reverse(),32),0x995a86,0xe49ac1),capMat,[.035,stemHeight,0]);
  part(grove,'PALE_MUSHROOM_COLLAR',new THREE.ConeGeometry(r*.27,r*.17,20,1,true),stem,[.015,stemHeight*.77,0],[Math.PI,0,0]);
  for(let i=0;i<10;i++){
   const a=i/10*Math.PI*2;
   branch(grove,'RADIAL_MUSHROOM_GILL',[[Math.cos(a)*r*.2,stemHeight-.055,Math.sin(a)*r*.2],[Math.cos(a)*r*.62,stemHeight-.095,Math.sin(a)*r*.62],[Math.cos(a)*r*.92,stemHeight-.024,Math.sin(a)*r*.92]],.008,gills);
  }
  for(let i=0;i<8;i++){
   const a=i*2.399,d=i%3===0?.22:.63,px=Math.cos(a)*r*d,pz=Math.sin(a)*r*d,py=stemHeight+r*.43*(1-d*d);
   const spot=part(grove,'LUMINOUS_MUSHROOM_SPOT',new THREE.SphereGeometry(r*.085,10,6),spotMat,[px+.035,py,pz]);spot.scale.y=.24;spot.userData.landscapePulse={base:.1,phase:i*.4};spot.userData.collisionDisabled=true;
  }
  rock(root,'MUSHROOM_MOSS_FOOT',[x,.035,z],[r*.48,.045,r*.44],moss,1);
 }
}

function cactus(root){
 const green=mat(0x518765),rib=mat(0x77a179),spine=mat(0xe7d7b2),flower=mat(0xe3889b,.68),heart=mat(0xf2cc71,.6),earth=mat(0x9d8a65);
 const trunkH=2.74,trunkR=.25;
 part(root,'RIBBED_SAGUARO_STEM',new THREE.CapsuleGeometry(trunkR,trunkH-trunkR*2,8,16),green,[0,trunkH/2,0]);
 for(let i=0;i<12;i++){
  const a=i/12*Math.PI*2;
  branch(root,'CACTUS_VERTICAL_RIB',[[Math.cos(a)*.17,.045,Math.sin(a)*.17],[Math.cos(a)*.25,.35,Math.sin(a)*.25],[Math.cos(a)*.25,2.4,Math.sin(a)*.25],[Math.cos(a)*.12,2.7,Math.sin(a)*.12]],.016,rib);
 }
 for(const [side,base,height]of [[-1,1.25,2.2],[1,.93,1.79]]){
  branch(root,'CURVED_CACTUS_ARM',[[side*.08,base,0],[side*.49,base+.06,0],[side*.58,base+.3,0],[side*.58,height,0]],.135,green);
  part(root,'CACTUS_ARM_CROWN',new THREE.SphereGeometry(.135,14,8),green,[side*.58,height,0]);
  for(let i=0;i<7;i++){
   const a=i/7*Math.PI*2;
   branch(root,'CACTUS_ARM_RIB',[[side*.58+Math.cos(a)*.137,base+.36,Math.sin(a)*.137],[side*.58+Math.cos(a)*.137,height-.04,Math.sin(a)*.137],[side*.58+Math.cos(a)*.07,height+.1,Math.sin(a)*.07]],.01,rib);
  }
 }
 for(let row=0;row<6;row++)for(const angle of [-2.5,-1.6,-.7,.2]){
  const y=.35+row*.38,x=Math.cos(angle)*.26,z=Math.sin(angle)*.26;
  tapered(root,'SAGUARO_SPINE',[x,y,z],[x+Math.cos(angle)*.048,y+.014,z+Math.sin(angle)*.048],.007,.001,spine);
 }
 const bloom=new THREE.Group();bloom.position.set(0,2.77,0);root.add(bloom);
 for(let i=0;i<7;i++){
  const a=i/7*Math.PI*2,p=part(bloom,'CORAL_CACTUS_PETAL',new THREE.SphereGeometry(.11,12,8),flower,[Math.cos(a)*.09,.025,Math.sin(a)*.09]);p.scale.set(.7,.32,1.35);p.rotation.y=-a+Math.PI/2;
 }
 part(bloom,'GOLDEN_FLOWER_HEART',new THREE.SphereGeometry(.07,12,8),heart,[0,.055,0]);
 for(let i=0;i<5;i++)rock(root,'DESERT_BASE_PEBBLE',[Math.cos(i*2.4)*.37,.035,Math.sin(i*2.4)*.3],[.09,.055,.07],earth);
}

export function createCraftedLandscapeModel(id){
 const info=CRAFTED_LANDSCAPE_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group();({'terrain-cliff':cliff,'terrain-river':river,'terrain-crater':crater,'terrain-snowbank':snow,'ancient-oak':oak,'palm-cluster':palms,'giant-mushrooms':mushrooms,'desert-cactus':cactus})[id](root);
 root.name=info[0];root.userData={craftedLandscapeModel:true,builderObject:true,modelId:id,label:info[0],description:info[1],dimensions:[...info[2]],behavior:'decor',interactive:false,animated:true};
 const bounds=new THREE.Box3().setFromObject(root,true);if(Number.isFinite(bounds.min.y))for(const child of root.children)child.position.y-=bounds.min.y;
 root.traverse(node=>{if(node.userData.landscapeSway)node.userData.landscapeSway.base=node.rotation[node.userData.landscapeSway.axis];if(node.isMesh){node.userData.builderRoot=root;node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;}});
 return finishGameItem(THREE,root);
}

export function updateCraftedLandscapeModel(root,elapsed){
 if(!root?.userData?.craftedLandscapeModel||root.userData.animationState?.enabled===false)return;
 const speed=Number(root.userData.animationState?.speed??1),time=(Number.isFinite(elapsed)?elapsed:0)*(Number.isFinite(speed)?Math.max(0,speed):1);
 root.traverse(node=>{
  const sway=node.userData.landscapeSway,pulse=node.userData.landscapePulse,water=node.userData.landscapeWater;
  if(sway)node.rotation[sway.axis]=sway.base+Math.sin(time*.7+sway.phase)*sway.amplitude;
  if(pulse&&node.material?.emissive)node.material.emissiveIntensity=pulse.base*(1+Math.sin(time*1.6+pulse.phase)*.2);
  if(water&&node.material)node.material.opacity=water.base+Math.sin(time*1.15+(water.phase||0))*.025;
 });
}
