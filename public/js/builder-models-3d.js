import * as THREE from '../vendor/three/three.module.min.js';

// Gameplay-ready replacements for the flat SVG editor thumbnails. Dimensions are
// in metres so furniture, plants, and architecture retain believable human scale.
export const BUILDER_MODEL_INFO = Object.freeze({
  'grand-floor': ['Grand Build Floor', 'A playable foundation tile that expands the walkable world directly from the Backpack.', [8, .24, 8]],
  'open-studio': ['Open Studio', 'An open-sided playable studio room with a floor, feature wall and neon columns.', [6, 2.8, 5]],
  'connected-suite': ['Connected Suite', 'A playable connected room with two doorways and a raised floor.', [6, 2.8, 5]],
  'garden-courtyard': ['Garden Courtyard', 'A playable garden room with a lawn, paths and low boundary walls.', [6, 1.2, 5]],
  'corsair-aircraft': ['Blackwing Corsair', 'A flyable open-cockpit gull-wing aircraft with a working propeller and exposed black airframe.', [10.5, 2.7, 8.2]],
  'dune-quad': ['Nightcrawler Dune Quad', 'A rideable bodyless dune buggy with an exposed black tube frame, engine and four off-road tyres.', [2.7, 1.35, 1.6]],
  'canopy-tree': ['Canopy Tree', 'A broad deciduous shade tree with a textured trunk and layered green crown.', [3.8, 5.2, 3.8]],
  'pine-tree': ['Pine Tree', 'A tall evergreen conifer with tiered needles and a natural timber trunk.', [2.8, 5.8, 2.8]],
  'flower-bed': ['Flower Bed', 'A low soil bed planted with colourful flowering stems.', [2.4, .35, 1.2]],
  'hedge-corner': ['Hedge Corner', 'A clipped L-shaped evergreen hedge for defining garden boundaries.', [2.4, 1.05, 2.4]],
  'garden-rocks': ['Garden Rocks', 'A grounded cluster of weathered stone in varied natural sizes.', [2.1, .75, 1.5]],
  pond: ['Reflecting Pond', 'A shallow stone-edged pond with animated reflective blue water.', [3.4, .22, 2.5]],
  'path-tile': ['Path Tile', 'A durable rectangular stone paving slab set at ground level.', [2.2, .12, 1.2]],
  hill: ['Soft Hill', 'A gently rounded grass-covered landform with a walkable silhouette.', [4.2, 1.25, 3.6]],
  'lamp-post': ['Lamp Post', 'A full-height metal street lamp casting a warm pool of light.', [.55, 3.4, .55]],
  planter: ['Tall Planter', 'A waist-high ceramic planter holding a leafy ornamental plant.', [.85, 1.45, .85]],
  sofa: ['Cloud Sofa', 'A soft three-seat upholstered sofa with padded arms and cushions.', [2.15, .9, .92]],
  armchair: ['Accent Chair', 'A single upholstered lounge chair with supportive arms and back.', [.9, 1.02, .9]],
  'coffee-table': ['Coffee Table', 'A low timber table with a solid top and four stable legs.', [1.25, .46, .72]],
  bookshelf: ['Bookshelf', 'A tall timber bookcase filled with individually coloured books.', [1.2, 2.05, .38]],
  'floor-lamp': ['Floor Lamp', 'A standing metal lamp with a warm illuminated fabric shade.', [.62, 1.75, .62]],
  'room-divider': ['Room Divider', 'A slatted timber screen that separates spaces without blocking light.', [1.8, 2.0, .18]],
  'kitchen-island': ['Kitchen Island', 'A correctly scaled kitchen worktop with cabinets and metal fixtures.', [2.1, .94, .9]],
  'spiral-stairs': ['Spiral Stairs', 'A climbable-scale spiral staircase winding around a central column.', [2.1, 2.8, 2.1]],
  archway: ['Archway', 'A masonry passage with two pillars and a curved overhead arch.', [2.4, 2.8, .5]],
  'art-wall': ['Art Wall', 'A gallery wall with a framed colourful abstract artwork.', [2.2, 2.15, .18]],
  'studio-desk':['Producer Studio Desk','Production desk with displays, monitors and mixing surface.',[2.4,1.4,1]], 'recording-booth':['Recording Booth','Enclosed acoustic booth with glazed door and microphone.',[2.4,2.65,2.2]], 'modular-wall':['Modular Building Wall','Full-height framed wall bay for realistic room construction.',[3.2,2.8,.28]], 'glass-door':['Glass Entry Door','Human-scale glazed door with structural frame and handle.',[1.25,2.35,.18]], 'loft-bed':['Loft Bed','Raised bed, mattress, guard rail and ladder.',[2.15,2.05,1.25]], wardrobe:['Walk-in Wardrobe','Fitted wardrobe with shelves, rail and drawers.',[2.35,2.35,.62]], 'bathroom-vanity':['Bathroom Vanity','Vanity cabinet, basin, mirror and fixtures.',[1.55,2.15,.58]], 'dining-set':['Dining Set','Six-place dining table and correctly scaled chairs.',[2.8,1.05,2.25]], fireplace:['Modern Fireplace','Stone hearth, mantel and animated flame bed.',[2.2,2.05,.48]], elevator:['Working Elevator','Framed lift entrance, split doors and call control.',[2.5,3,.55]]
});

const material = (color, roughness=.65, metalness=.02, extra={}) => new THREE.MeshStandardMaterial({color, roughness, metalness, ...extra});
const mesh = (geometry, mat, position=[0,0,0], rotation=[0,0,0]) => { const value=new THREE.Mesh(geometry,mat); value.position.set(...position); value.rotation.set(...rotation); return value; };
const box = (size, mat, position) => mesh(new THREE.BoxGeometry(...size),mat,position);
const cylinder = (r1,r2,h,mat,position,segments=16) => mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat,position);

function vehicle(id){
 const root=new THREE.Group(),black=material(0x090b0d,.28,.82),rubber=material(0x080808,.94,.02),steel=material(0x596169,.25,.88),engine=material(0x34393d,.38,.72),tube=(a,b,r=.055)=>{const d=new THREE.Vector3().subVectors(b,a),part=cylinder(r,r,d.length(),black,a.clone().add(b).multiplyScalar(.5),10);part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());root.add(part);return part;};
 if(id==='dune-quad'){
  [[-1.05,.42,-.62],[-1.05,.42,.62],[1.05,.42,-.62],[1.05,.42,.62]].forEach(([x,y,z])=>{const tyre=mesh(new THREE.TorusGeometry(.34,.14,12,24),rubber,[x,y,z],[Math.PI/2,0,0]);tyre.userData.vehicleWheel=true;root.add(tyre,cylinder(.08,.08,.42,steel,[x,y,z],10));});
  const p=[new THREE.Vector3(-.92,.42,-.48),new THREE.Vector3(-.92,.42,.48),new THREE.Vector3(.92,.42,-.48),new THREE.Vector3(.92,.42,.48),new THREE.Vector3(-.62,1.08,-.42),new THREE.Vector3(-.62,1.08,.42),new THREE.Vector3(.65,.88,-.42),new THREE.Vector3(.65,.88,.42)];[[0,2],[1,3],[0,1],[2,3],[0,4],[1,5],[4,5],[4,6],[5,7],[6,7],[2,6],[3,7]].forEach(([a,b])=>tube(p[a],p[b],.06));root.add(box([.58,.48,.62],engine,[.48,.58,0]),cylinder(.18,.18,.58,engine,[.75,.72,0],12),box([.55,.1,.48],material(0x202326,.8),[-.25,.69,0]));
  root.userData.vehicle={mode:'drive',seat:[-.2,.82,0],speed:9,turnSpeed:1.75};
 }else{
  const nose=new THREE.Vector3(0,1.05,-3.55),cockpit=new THREE.Vector3(0,1.05,.25),tail=new THREE.Vector3(0,1.35,3.5);tube(nose,cockpit,.1);tube(cockpit,tail,.08);[[-.7,.55,-2.7],[.7,.55,-2.7],[-.72,.5,2.35],[.72,.5,2.35]].forEach(v=>tube(cockpit,new THREE.Vector3(...v),.055));
  const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.85,-.5),new THREE.Vector3(-5.25,.38,.55),new THREE.Vector3(-4.65,.72,1.25),new THREE.Vector3(0,1.05,.72)]);geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();const wing=mesh(geo,black);root.add(wing);const wing2=wing.clone();wing2.scale.x=-1;root.add(wing2,box([3.25,.08,.72],black,[0,1.18,3.05]),box([.09,1.3,1.15],black,[0,1.75,3.12]),cylinder(.55,.78,1.45,engine,[0,1.03,-3.2],18));
  const prop=new THREE.Group();prop.position.set(0,1.03,-4);prop.rotation.x=Math.PI/2;prop.add(box([.16,.08,2.85],steel),box([2.85,.08,.16],steel));prop.userData.vehiclePropeller=true;root.add(prop);[[-1,.48,-.3],[1,.48,-.3],[0,.54,2.55]].forEach(([x,y,z])=>root.add(mesh(new THREE.TorusGeometry(.25,.09,10,20),rubber,[x,y,z],[0,Math.PI/2,0])));root.add(mesh(new THREE.TorusGeometry(.52,.055,10,26,Math.PI),black,[0,1.35,.15],[0,0,Math.PI]));root.userData.vehicle={mode:'fly',seat:[0,1.28,.2],speed:18,turnSpeed:1.15};
 }
 return root;
}

// Vertex RGB is blended over the height of each surface, with a small deterministic
// variation per vertex. This keeps silhouettes readable without the flat, toy-like
// fill of a single base colour and still responds to every light in the scene.
const gradedMaterial=(roughness=.72,metalness=.04,extra={})=>new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness,metalness,...extra});
function graded(geometry,bottom,top,position=[0,0,0],options={}){
 const g=geometry.clone(),p=g.attributes.position,lo=new THREE.Color(bottom),hi=new THREE.Color(top),colors=[];let min=Infinity,max=-Infinity;
 for(let i=0;i<p.count;i++){min=Math.min(min,p.getY(i));max=Math.max(max,p.getY(i))}
 for(let i=0;i<p.count;i++){const noise=(Math.sin(p.getX(i)*17.13+p.getZ(i)*31.7+i*.73)+1)*.035,t=THREE.MathUtils.clamp((p.getY(i)-min)/Math.max(.001,max-min)+noise,0,1),c=lo.clone().lerp(hi,t);colors.push(c.r,c.g,c.b)}
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return mesh(g,gradedMaterial(options.roughness,options.metalness,options.extra),position,options.rotation||[0,0,0]);
}
const EXPANDED={
 'terrain-cliff':['terrain',4.8,3.2,3.5], 'terrain-river':['terrain',6,.2,3], 'terrain-crater':['terrain',5,.8,5], 'terrain-snowbank':['terrain',4,1.2,2.4],
 'ancient-oak':['plant',4.5,6,4.5], 'palm-cluster':['plant',3.5,5,3.5], 'giant-mushrooms':['plant',2.4,2.2,2], 'desert-cactus':['plant',1.5,3,1.2],
 'timber-cabin':['building',6,3.6,5], 'stone-tower':['building',4,7,4], 'market-stall':['building',3,2.8,2.2], 'sci-fi-bunker':['building',7,3,5],
 'supply-crate':['prop',1.1,1,1.1], 'wooden-cart':['prop',2.4,1.5,1.2], 'iron-anvil':['prop',.9,.8,.45], 'street-sign':['prop',1.2,2.4,.5],
 'plasma-sword':['weapon',.25,1.4,.12], 'battle-axe':['weapon',.8,1.5,.16], 'arc-bow':['weapon',.9,1.3,.12], 'crystal-staff':['weapon',.3,1.8,.3],
 'forest-ranger':['character',.75,1.8,.55], 'desert-merchant':['character',.8,1.75,.6], 'clockwork-knight':['character',.85,1.9,.65], 'spectral-ghost':['character',.85,1.7,.6],
 'emerald-slime':['creature',1,.8,.9], 'moss-golem':['creature',1.4,2.6,1], 'cave-spider':['creature',1.8,.65,1.6], 'sky-ray':['creature',3.2,.55,1.8],
 'lever-switch':['interactive',.8,1.1,.5], 'treasure-chest':['interactive',1.2,.8,.7], 'teleport-pad':['interactive',2.2,.2,2.2], windmill:['interactive',4,6,2.5]
};
function expandedModel(id){
 const [kind,w,h,d]=EXPANDED[id],root=new THREE.Group(),wood=gradedMaterial(.86,.02),metal=gradedMaterial(.28,.75),add=value=>(root.add(value),value),rgb=(geo,a,b,pos,opt)=>add(graded(geo,a,b,pos,opt));
 if(kind==='terrain'){const geo=id==='terrain-river'?new THREE.BoxGeometry(w,h,d,10,1,8):new THREE.IcosahedronGeometry(w*.5,2),part=rgb(geo,id==='terrain-snowbank'?0xaac5cf:id==='terrain-river'?0x176f94:0x393a35,id==='terrain-snowbank'?0xf8ffff:id==='terrain-river'?0x68d7e8:0x88806e,[0,h*.32,0],{roughness:id==='terrain-river'?.18:.96,extra:id==='terrain-river'?{transparent:true,opacity:.82}: {}});part.scale.set(1,h/w,d/w);if(id==='terrain-river')part.userData.water=true;}
 else if(kind==='plant'){const trunk=rgb(new THREE.CylinderGeometry(.18,.32,h*.58,12),0x3c2115,0x8f5c30,[0,h*.29,0],{roughness:.94});if(id==='desert-cactus'){trunk.geometry=new THREE.CylinderGeometry(.3,.4,h,14);trunk.position.y=h/2;trunk.material=gradedMaterial(.9);['color'].forEach(()=>{});[-1,1].forEach(s=>{const arm=rgb(new THREE.CylinderGeometry(.14,.18,h*.34,10),0x28623e,0x68ad63,[s*.42,h*.52,0],{roughness:.9});arm.rotation.z=s*.75});}else if(id==='giant-mushrooms'){trunk.visible=false;for(let i=0;i<4;i++){const x=(i-1.5)*.55,y=.65+i%2*.25;rgb(new THREE.CylinderGeometry(.1,.16,y,10),0xd6c19f,0xffebcf,[x,y/2,0],{roughness:.85});const cap=rgb(new THREE.SphereGeometry(.42,18,10),0x6e204d,0xf680b3,[x,y,0],{roughness:.68});cap.scale.y=.36;cap.userData.swayPhase=i}}else{const leafColor=id==='palm-cluster'?[0x174f2e,0x67b84b]:[0x173c24,0x6ba44d];for(let i=0;i<(id==='palm-cluster'?9:7);i++){const a=i/7*Math.PI*2,crown=rgb(id==='palm-cluster'?new THREE.ConeGeometry(.55,2.2,8):new THREE.IcosahedronGeometry(1.2,2),...leafColor,[Math.cos(a)*.75,h*.67+Math.sin(i)*.25,Math.sin(a)*.6],{roughness:.9});crown.rotation.z=id==='palm-cluster'?a:0;crown.userData.swayPhase=i*.7}}}
 else if(kind==='building'){rgb(new THREE.BoxGeometry(w,h*.72,d),id==='sci-fi-bunker'?0x26343b:id==='stone-tower'?0x494b48:0x59351f,id==='sci-fi-bunker'?0x6e8790:id==='stone-tower'?0x93958c:0xb47a49,[0,h*.36,0],{roughness:.82,metalness:id==='sci-fi-bunker'?.35:.03});rgb(new THREE.ConeGeometry(w*.68,h*.3,4),0x49251b,0xa34e32,[0,h*.86,0],{roughness:.8,rotation:[0,Math.PI/4,0]});rgb(new THREE.BoxGeometry(w*.22,h*.48,.12),0x171b1c,0x506b72,[0,h*.24,-d/2-.07],{roughness:.35,metalness:.3});}
 else if(kind==='character'||kind==='creature'){const spectral=id==='spectral-ghost',body=rgb(kind==='creature'?new THREE.SphereGeometry(w*.45,20,14):new THREE.CapsuleGeometry(w*.28,h*.48,8,16),spectral?0x77bed0:id==='emerald-slime'?0x245d28:0x49382f,spectral?0xe5ffff:id==='emerald-slime'?0xa9f45d:0xc79568,[0,h*.45,0],{roughness:.6,extra:spectral?{transparent:true,opacity:.68,emissive:0x438da0,emissiveIntensity:.4}:{}});body.scale.y=kind==='creature'?h/w:1;body.userData.swayPhase=0;if(kind==='character'&&!spectral){rgb(new THREE.SphereGeometry(w*.25,18,12),0x8e5b3f,0xe2aa7c,[0,h*.86,0],{roughness:.72});[-1,1].forEach(s=>rgb(new THREE.CylinderGeometry(.07,.09,h*.42,8),0x293741,0x768c65,[s*w*.23,h*.23,0],{roughness:.7}))}if(id==='cave-spider')for(let i=0;i<8;i++){const leg=rgb(new THREE.CylinderGeometry(.025,.04,.9,6),0x1a1720,0x665873,[Math.cos(i)*.6,.22,Math.sin(i)*.5],{roughness:.8});leg.rotation.z=Math.cos(i)*1.15}}
 else if(kind==='weapon'){const glow=id==='plasma-sword'||id==='crystal-staff';rgb(new THREE.CylinderGeometry(.045,.06,h*.82,10),0x263039,glow?0x8ff8ff:0xc9d0d2,[0,h*.45,0],{roughness:glow?.18:.35,metalness:.72,extra:glow?{emissive:0x36cde5,emissiveIntensity:1.1}:{}});rgb(new THREE.BoxGeometry(w,.1,.12),0x49301d,0xc9934f,[0,.15,0],{roughness:.7});}
 else {rgb(new THREE.BoxGeometry(w,h,d),id==='treasure-chest'?0x553019:0x30383b,id==='treasure-chest'?0xb67b35:0xd7c36d,[0,h/2,0],{roughness:.55,metalness:.25});if(id==='teleport-pad'){const ring=rgb(new THREE.TorusGeometry(w*.38,.08,10,36),0x4b2684,0xc8a9ff,[0,h+.06,0],{roughness:.2,metalness:.3,extra:{emissive:0x7d46bd,emissiveIntensity:.9},rotation:[Math.PI/2,0,0]});ring.userData.water=true}else if(id==='windmill'){const hub=rgb(new THREE.CylinderGeometry(.18,.18,.35,14),0x4b5052,0xc8d0cf,[0,h*.72,-d*.52],{metalness:.7,rotation:[Math.PI/2,0,0]});for(let i=0;i<4;i++){const blade=rgb(new THREE.BoxGeometry(.22,h*.35,.06),0x6d4b2f,0xe0c695,[0,h*.72,-d*.63],{roughness:.74});blade.geometry.translate(0,h*.2,0);blade.rotation.z=i*Math.PI/2;blade.userData.spin=true}hub.userData.spin=true}}
 root.userData={builderObject:true,modelId:id,dimensions:[w,h,d],animated:true};return root;
}

function plant(id) {
  const root=new THREE.Group(), trunk=material(0x6d3f20,.9), leaf=material(id==='pine-tree'?0x195f38:0x3e9b45,.88);
  root.add(cylinder(.18,.27,id==='pine-tree'?3.3:3.1,trunk,[0,1.65,0],12));
  if(id==='pine-tree') for(let i=0;i<4;i++) root.add(mesh(new THREE.ConeGeometry(1.35-i*.2,1.65,12),leaf,[0,2.15+i*.72,0]));
  else [[0,3.35,0,1.28],[-.78,3.15,.15,.95],[.72,3.25,.18,1.02],[0,3.7,-.55,.9]].forEach(([x,y,z,s])=>{const crown=mesh(new THREE.IcosahedronGeometry(s,2),leaf,[x,y,z]);crown.userData.swayPhase=Math.random()*6;root.add(crown);});
  return root;
}
function flowerBed(){const root=new THREE.Group(),soil=material(0x4b2918,1),green=material(0x2e8b45,.85);root.add(box([2.4,.22,1.2],material(0x8f6a4c,.92),[0,.11,0]),box([2.16,.12,.96],soil,[0,.24,0]));const colors=[0xff477e,0xffd23f,0x7bdff2,0xf7aef8];for(let i=0;i<12;i++){const x=-.9+(i%4)*.6,z=-.3+Math.floor(i/4)*.3;root.add(cylinder(.018,.022,.25,green,[x,.4,z],6),mesh(new THREE.SphereGeometry(.075,8,6),material(colors[i%4],.55),[x,.55,z]));}return root;}
function hedge(){const root=new THREE.Group(),mat=material(0x287a3d,.95);root.add(box([2.4,1.05,.55],mat,[0,.525,0]),box([.55,1.05,2.4],mat,[-.925,.525,.925]));return root;}
function rocks(){const root=new THREE.Group(),mat=material(0x747b7c,1);[[-.55,.34,0,.72],[.25,.26,.24,.55],[.62,.2,-.3,.42]].forEach(([x,y,z,s],i)=>{const rock=mesh(new THREE.DodecahedronGeometry(s,0),mat.clone(),[x,y,z],[0,i*.7,.12]);rock.scale.y=.65;root.add(rock);});return root;}
function pond(){const root=new THREE.Group(),stone=material(0x777c78,.92),water=material(0x36aee8,.12,.05,{transparent:true,opacity:.78});root.add(mesh(new THREE.CylinderGeometry(1.7,1.7,.18,32),stone,[0,.09,0]));const surface=mesh(new THREE.CircleGeometry(1.48,40),water,[0,.195,0],[-Math.PI/2,0,0]);surface.scale.y=.74;surface.userData.water=true;root.add(surface);return root;}
function lamp(post=false){const root=new THREE.Group(),dark=material(0x24292d,.3,.82),glow=material(0xffdb78,.22,.05,{emissive:0xffb52e,emissiveIntensity:1.35});root.add(cylinder(.2,.28,.12,dark,[0,.06,0]),cylinder(.045,.06,post?2.85:1.35,dark,[0,post?1.48:.72,0],12));if(post){root.add(box([.48,.22,.48],dark,[0,2.88,0]),box([.34,.28,.34],glow,[0,2.88,0]));}else root.add(mesh(new THREE.CylinderGeometry(.31,.18,.4,20,1,true),glow,[0,1.53,0]));return root;}
function planter(){const root=new THREE.Group();root.add(mesh(new THREE.CylinderGeometry(.35,.27,.72,18),material(0xd46b43,.7),[0,.36,0]));for(let i=0;i<8;i++){const a=i/8*Math.PI*2,leaf=mesh(new THREE.SphereGeometry(.24,10,7),material(0x3f9c50,.8),[Math.cos(a)*.22,.9+Math.sin(i)*.08,Math.sin(a)*.22]);leaf.scale.set(.55,1.5,.55);leaf.rotation.z=Math.cos(a)*.45;root.add(leaf);}return root;}
function seating(chair=false){const root=new THREE.Group(),fabric=material(chair?0xff735c:0x71b9d4,.82),dark=material(0x34251e,.8);const width=chair?.9:2.15;root.add(box([width,.28,.72],fabric,[0,.48,0]),box([width,.58,.22],fabric,[0,.84,.31]),box([.18,.48,.78],fabric,[-width/2+.09,.57,0]),box([.18,.48,.78],fabric,[width/2-.09,.57,0]));[-1,1].forEach(s=>root.add(cylinder(.035,.045,.32,dark,[s*(width/2-.15),.16,-.24],8),cylinder(.035,.045,.32,dark,[s*(width/2-.15),.16,.24],8)));return root;}
function coffeeTable(){const root=new THREE.Group(),wood=material(0x8d5731,.62);root.add(box([1.25,.12,.72],wood,[0,.4,0]));for(const x of [-.5,.5])for(const z of [-.24,.24])root.add(box([.09,.4,.09],wood,[x,.2,z]));return root;}
function bookshelf(){const root=new THREE.Group(),wood=material(0x6e4328,.72);root.add(box([1.2,2.05,.16],wood,[0,1.025,.12]),box([.12,2.05,.38],wood,[-.54,1.025,0]),box([.12,2.05,.38],wood,[.54,1.025,0]));const colors=[0xe85d75,0x45b5aa,0xf4bf4f,0x6d75d8];for(let row=0;row<4;row++){root.add(box([1.08,.08,.38],wood,[0,.08+row*.49,0]));for(let i=0;i<6;i++)root.add(box([.12,.32+(i%2)*.06,.2],material(colors[(i+row)%4],.78),[-.42+i*.17,.27+row*.49,-.02]));}return root;}
function divider(){const root=new THREE.Group(),wood=material(0x9b6b3f,.72);for(let i=0;i<8;i++)root.add(box([.11,2,.14],wood,[-.82+i*.235,1,0]));root.add(box([1.8,.12,.18],wood,[0,.06,0]),box([1.8,.12,.18],wood,[0,1.94,0]));return root;}
function island(){const root=new THREE.Group(),cabinet=material(0x42606c,.55),top=material(0xe8e1d5,.24);root.add(box([1.9,.82,.76],cabinet,[0,.41,0]),box([2.1,.12,.9],top,[0,.88,0]));[-.48,0,.48].forEach(x=>root.add(box([.018,.5,.02],material(0xaeb8bb,.22,.8),[x,.42,-.391])));root.add(cylinder(.025,.025,.42,material(0xc2c9cb,.2,.9),[.62,1.13,0],10),mesh(new THREE.TorusGeometry(.17,.025,8,14,Math.PI),material(0xc2c9cb,.2,.9),[.62,1.3,0],[0,0,Math.PI/2]));return root;}
function stairs(){const root=new THREE.Group(),metal=material(0x68757c,.35,.72),wood=material(0x9a6338,.62);root.add(cylinder(.055,.055,2.8,metal,[0,1.4,0],12));for(let i=0;i<14;i++){const a=i/14*Math.PI*2.15,step=box([.82,.1,.32],wood,[Math.cos(a)*.45,.1+i*.185,Math.sin(a)*.45]);step.rotation.y=-a;root.add(step);const rail=cylinder(.018,.018,.82,metal,[Math.cos(a)*.9,.55+i*.185,Math.sin(a)*.9],7);root.add(rail);}return root;}
function arch(){const root=new THREE.Group(),stone=material(0xc9b89e,.88);root.add(box([.48,2.15,.5],stone,[-.96,1.075,0]),box([.48,2.15,.5],stone,[.96,1.075,0]));for(let i=0;i<9;i++){const a=Math.PI-(i/8)*Math.PI,block=box([.48,.38,.5],stone,[Math.cos(a)*.96,2.05+Math.sin(a)*.62,0]);block.rotation.z=a-Math.PI/2;root.add(block);}return root;}
function artWall(){const root=new THREE.Group();root.add(box([2.2,2.15,.12],material(0xe7e0d5,.92),[0,1.075,0]),box([1.55,1.25,.08],material(0x2e2522,.5),[0,1.2,-.1]),box([1.38,1.08,.035],material(0xff5470,.45),[0,1.2,-.15]));const accent=mesh(new THREE.TorusKnotGeometry(.25,.08,48,8),material(0x47e4ff,.28,.15),[0,1.2,-.2]);accent.rotation.x=Math.PI/2;root.add(accent);return root;}

function detailedInterior(id){
 const root=new THREE.Group(),wood=material(0x795238,.7),dark=material(0x273139,.32,.55),light=material(0xe7ded0,.7),glass=material(0x72d9e8,.12,.15,{transparent:true,opacity:.38}),accent=material(0xb9ff38,.25,.15,{emissive:0x4b761f,emissiveIntensity:.45});
 const panel=(w,h,x=0,y=h/2,z=0,mat=dark)=>root.add(box([w,h,.12],mat,[x,y,z]));
 if(id==='studio-desk'){root.add(box([2.4,.12,.9],wood,[0,.78,0]),box([.85,.5,.08],dark,[0,1.25,0]),box([1.05,.08,.36],accent,[0,.86,-.2]));[-1,1].forEach(x=>root.add(box([.12,.78,.72],dark,[x,.39,0]),box([.42,.62,.2],dark,[x*.7,1.15,.04])));}
 else if(id==='recording-booth'){root.add(box([2.4,.12,2.2],dark,[0,.06,0]),box([2.4,2.65,.12],dark,[0,1.325,1.04]),box([.12,2.65,2.2],dark,[-1.14,1.325,0]),box([.12,2.65,2.2],dark,[1.14,1.325,0]),box([1.05,2.35,.08],glass,[.55,1.25,-1.04]),cylinder(.025,.025,1.65,dark,[0,.83,0],8),mesh(new THREE.SphereGeometry(.12,12,8),dark,[0,1.7,0]));}
 else if(id==='modular-wall'){panel(3.2,2.8,0,1.4,0,light);for(let x=-1.5;x<=1.5;x+=.6)root.add(box([.12,2.65,.2],wood,[x,1.4,-.1]));}
 else if(id==='glass-door'){panel(1.25,2.35,0,1.175,0,glass);[-.58,.58].forEach(x=>root.add(box([.1,2.35,.18],dark,[x,1.175,0])));root.add(cylinder(.025,.025,.42,dark,[.38,1.12,-.08],8));}
 else if(id==='loft-bed'){root.add(box([2.15,.18,1.25],wood,[0,1.45,0]),box([1.95,.22,1.1],light,[0,1.62,0]));for(const x of [-.98,.98])for(const z of [-.52,.52])root.add(box([.1,1.5,.1],wood,[x,.75,z]));for(let y=.25;y<1.4;y+=.28)root.add(box([.55,.07,.1],wood,[1.2,y,-.52]));}
 else if(id==='wardrobe'){panel(2.35,2.35,0,1.175,.25,wood);[-1.1,1.1].forEach(x=>root.add(box([.12,2.35,.62],wood,[x,1.175,0])));root.add(cylinder(.025,.025,2.05,dark,[0,1.72,0],8));for(let y=.2;y<1.2;y+=.3)root.add(box([.95,.08,.58],light,[.58,y,0]));}
 else if(id==='bathroom-vanity'){root.add(box([1.55,.75,.58],wood,[0,.375,0]),box([1.62,.1,.62],light,[0,.8,0]),mesh(new THREE.CylinderGeometry(.32,.25,.16,24),light,[0,.9,0]),box([1.25,1.05,.04],glass,[0,1.55,.25]));}
 else if(id==='dining-set'){root.add(box([1.9,.12,1.05],wood,[0,.78,0]));for(let i=0;i<6;i++){const x=i<3?-1.2:1.2,z=-.68+(i%3)*.68;root.add(box([.48,.09,.48],accent,[x,.5,z]),box([.48,.72,.09],accent,[x,.85,z+(x<0?.2:-.2)]));}}
 else if(id==='fireplace'){panel(2.2,2.05,0,1.025,0,light);root.add(box([1.25,.85,.18],dark,[0,.58,-.22]),box([2.25,.16,.48],wood,[0,1.45,0]));for(let i=0;i<4;i++){const flame=mesh(new THREE.ConeGeometry(.12,.48,8),accent,[-.36+i*.24,.55,-.36]);flame.userData.water=true;root.add(flame);}}
 else {panel(2.5,3,0,1.5,0,dark);root.add(box([1.04,2.68,.12],material(0x778187,.2,.8),[-.53,1.48,-.08]),box([1.04,2.68,.12],material(0x778187,.2,.8),[.53,1.48,-.08]),box([.28,.38,.08],accent,[1.4,1.35,0]));}
 return root;
}

function playableRoom(id) {
  const root = new THREE.Group();
  const floor = material(id === 'garden-courtyard' ? 0x4f8d48 : 0x343b42, .86);
  const wall = material(0x52616a, .72, .16);
  const accent = material(0xb9ff38, .32, .08, { emissive: 0x294b0d, emissiveIntensity: .65 });
  if (id === 'grand-floor') {
    root.add(box([8, .24, 8], floor, [0, .12, 0]));
    for (const value of [-4, 4]) root.add(box([8.2, .12, .12], accent, [0, .18, value]), box([.12, .12, 8.2], accent, [value, .18, 0]));
    root.userData.placementSurface = true;
    return root;
  }
  root.add(box([6, .18, 5], floor, [0, .09, 0]));
  if (id === 'garden-courtyard') {
    root.add(box([6, .55, .22], wall, [0, .275, 2.39]), box([6, .55, .22], wall, [0, .275, -2.39]), box([.22, .55, 5], wall, [-2.89, .275, 0]), box([.22, .55, 5], wall, [2.89, .275, 0]));
    root.add(box([1.05, .05, 5], material(0xb9aa8a, .95), [0, .205, 0]));
  } else {
    root.add(box([6, 2.8, .2], wall, [0, 1.4, 2.4]));
    for (const x of [-2.9, 2.9]) root.add(box([.2, 2.8, 5], wall, [x, 1.4, 0]));
    const columnXs = id === 'connected-suite' ? [-1.8, 1.8] : [-2.65, 2.65];
    columnXs.forEach((x) => root.add(box([.18, 2.55, .18], accent, [x, 1.275, -2.35])));
  }
  root.userData.placementSurface = true;
  return root;
}

export function createBuilderModel(id) {
  let root;
  if(['grand-floor','open-studio','connected-suite','garden-courtyard'].includes(id)) root=playableRoom(id);
  else if(id==='corsair-aircraft'||id==='dune-quad') root=vehicle(id);
  else if(EXPANDED[id]) return expandedModel(id);
  else if(id==='canopy-tree'||id==='pine-tree') root=plant(id); else if(id==='flower-bed')root=flowerBed(); else if(id==='hedge-corner')root=hedge(); else if(id==='garden-rocks')root=rocks(); else if(id==='pond')root=pond(); else if(id==='path-tile')root=box([2.2,.12,1.2],material(0xa39b8c,.95),[0,.06,0]); else if(id==='hill'){root=mesh(new THREE.SphereGeometry(2.1,24,12,0,Math.PI*2,0,Math.PI/2),material(0x4f9a45,.95),[0,0,0]);root.scale.z=.86;} else if(id==='lamp-post')root=lamp(true); else if(id==='planter')root=planter(); else if(id==='sofa'||id==='armchair')root=seating(id==='armchair'); else if(id==='coffee-table')root=coffeeTable(); else if(id==='bookshelf')root=bookshelf(); else if(id==='floor-lamp')root=lamp(false); else if(id==='room-divider')root=divider(); else if(id==='kitchen-island')root=island(); else if(id==='spiral-stairs')root=stairs(); else if(id==='archway')root=arch(); else if(id==='art-wall')root=artWall(); else if(BUILDER_MODEL_INFO[id])root=detailedInterior(id); else return null;
  const [name,description,dimensions]=BUILDER_MODEL_INFO[id];root.name=name;root.userData={...root.userData,builderObject:true,modelId:id,label:name,description,dimensions,animated:['canopy-tree','pine-tree','pond','lamp-post','floor-lamp'].includes(id)};
  root.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;child.userData.builderRoot=root;}});return root;
}

// Persistent registry entries with no authored GLB receive a semantic procedural
// model. These are deliberately shaped recipes, not missing-model cubes.
export function createGeneratedAsset(model) {
  const root=new THREE.Group(),recipe=model.generator,color=new THREE.Color(model.registry?.materials?.color||model.color||'#b9ff38'),primary=material(color,.5,.12),dark=material(0x24282b,.72,.35),add=(geometry,position=[0,0,0],rotation=[0,0,0],mat=primary)=>{const part=mesh(geometry,mat,position,rotation);root.add(part);return part};
  if(recipe==='bottle'){
    add(new THREE.SphereGeometry(.34,20,14),[0,.42,0]);add(new THREE.CylinderGeometry(.13,.2,.42,16),[0,.84,0]);add(new THREE.CylinderGeometry(.16,.16,.12,16),[0,1.08,0],undefined,dark);add(new THREE.TorusGeometry(.22,.045,8,20),[0,.38,0],[Math.PI/2,0,0],dark);
  }else if(recipe==='dynamite-bundle'){
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z+=2)add(new THREE.CylinderGeometry(.095,.095,.82,12),[x*.2,.42,z*.1],undefined,material(0xc63228,.65));add(new THREE.TorusGeometry(.29,.035,8,24),[0,.42,0],[Math.PI/2,0,0],dark);const fuse=add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,.83,0),new THREE.Vector3(.16,1.02,0),new THREE.Vector3(.24,1.12,.08)]),12,.018,6),[0,0,0],undefined,dark);fuse.userData.effect=true;
  }else if(recipe==='carrot'){
    add(new THREE.ConeGeometry(.2,.9,16),[0,.45,0],undefined,material(0xf47728,.72));for(let i=0;i<5;i++)add(new THREE.ConeGeometry(.08,.42,8),[(i-2)*.05,1.03,0],[0,0,(i-2)*.18],material(0x4b9b49,.82));
  }else if(recipe==='bone'){
    add(new THREE.CapsuleGeometry(.12,.64,6,12),[0,.28,0],[0,0,Math.PI/2],material(0xead9b0,.82));for(const x of [-.42,.42])for(const y of [-.1,.1])add(new THREE.SphereGeometry(.16,12,8),[x,.28+y,0],undefined,material(0xead9b0,.82));
  }else if(recipe==='fish'){
    const body=add(new THREE.SphereGeometry(.4,18,12),[0,.42,0]);body.scale.set(1,.55,.28);add(new THREE.ConeGeometry(.28,.42,3),[-.48,.42,0],[0,0,-Math.PI/2]);add(new THREE.SphereGeometry(.035,8,6),[.3,.49,-.1],undefined,dark);
  }else if(recipe==='cheese'){
    const shape=new THREE.Shape();shape.moveTo(-.42,0);shape.lineTo(.42,0);shape.lineTo(.42,.55);shape.lineTo(-.42,.18);shape.closePath();add(new THREE.ExtrudeGeometry(shape,{depth:.36,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:2}),[0,.05,-.18],undefined,material(0xf2c83b,.78));
  }else if(recipe==='terrain-slab'){
    const land=add(new THREE.CylinderGeometry(2.5,2.8,.45,24),[0,.225,0],undefined,material(0x477c43,.96));land.userData.placementSurface=true;root.userData.terrain=true;
  }else if(recipe==='extruded-svg'){
    const shape=new THREE.Shape();shape.moveTo(0,.95);shape.bezierCurveTo(.65,.72,.72,.05,0,0);shape.bezierCurveTo(-.72,.05,-.65,.72,0,.95);shape.closePath();add(new THREE.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:true,bevelSize:.06,bevelThickness:.05,bevelSegments:3}),[0,0,-.12]);
  }else if(recipe==='rad-tox-tool'){
    const variant=model.gameItem,neon=material(color,.28,.55,{emissive:color,emissiveIntensity:.55});
    if(variant==='bat')add(new THREE.CylinderGeometry(.08,.13,1.15,14),[0,.58,0],undefined,material(0xd7a84b,.56));
    else if(variant==='dynamite'){for(let x=-1;x<=1;x++)add(new THREE.CylinderGeometry(.08,.08,.72,12),[x*.17,.36,0],undefined,material(0xc63228,.65));add(new THREE.TorusGeometry(.23,.025,8,20),[0,.36,0],[Math.PI/2,0,0],dark);}
    else if(variant==='brick')add(new THREE.BoxGeometry(.85,.38,.42),[0,.19,0],undefined,material(0xd94b32,.72));
    else {add(new THREE.BoxGeometry(.18,.62,.18),[0,.31,0],[-.18,0,0],dark);add(new THREE.BoxGeometry(.72,.24,.22),[.24,.7,0],undefined,neon);add(new THREE.CylinderGeometry(.08,.08,.5,12),[.68,.7,0],[0,0,Math.PI/2],neon);if(variant==='toxin')add(new THREE.SphereGeometry(.18,14,10),[-.15,.8,0],undefined,material(0xb9ff38,.32,.1,{emissive:0x58a70d,emissiveIntensity:.8}));}
  }else throw new Error(`Unknown generated asset recipe: ${recipe}`);
  root.name=model.name;root.userData={...root.userData,builderObject:true,generated:true,generator:recipe,assetId:model.sourceId,dimensions:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray()};root.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});return root;
}

export function updateBuilderModels(group, elapsed) {
  group.children.forEach(root=>{root.traverse(child=>{if(child.userData.vehiclePropeller)child.rotation.z=elapsed*18;if(child.userData.vehicleWheel)child.rotation.z=elapsed*5;if(child.userData.water){if(child.material.transparent)child.material.opacity=.72+Math.sin(elapsed*1.4)*.06;child.rotation.z=elapsed*.25;}if(child.userData.spin)child.rotation.z=elapsed*.8;if(child.userData.swayPhase!==undefined)child.rotation.z=Math.sin(elapsed*.65+child.userData.swayPhase)*.025;});});
}
