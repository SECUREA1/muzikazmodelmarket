import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';

// Gameplay-ready replacements for the flat SVG editor thumbnails. Dimensions are
// in metres so furniture, plants, and architecture retain believable human scale.
export const BUILDER_MODEL_INFO = Object.freeze({
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

export function createBuilderModel(id) {
  let root;
  if(id==='canopy-tree'||id==='pine-tree') root=plant(id); else if(id==='flower-bed')root=flowerBed(); else if(id==='hedge-corner')root=hedge(); else if(id==='garden-rocks')root=rocks(); else if(id==='pond')root=pond(); else if(id==='path-tile')root=box([2.2,.12,1.2],material(0xa39b8c,.95),[0,.06,0]); else if(id==='hill'){root=mesh(new THREE.SphereGeometry(2.1,24,12,0,Math.PI*2,0,Math.PI/2),material(0x4f9a45,.95),[0,0,0]);root.scale.z=.86;} else if(id==='lamp-post')root=lamp(true); else if(id==='planter')root=planter(); else if(id==='sofa'||id==='armchair')root=seating(id==='armchair'); else if(id==='coffee-table')root=coffeeTable(); else if(id==='bookshelf')root=bookshelf(); else if(id==='floor-lamp')root=lamp(false); else if(id==='room-divider')root=divider(); else if(id==='kitchen-island')root=island(); else if(id==='spiral-stairs')root=stairs(); else if(id==='archway')root=arch(); else if(id==='art-wall')root=artWall(); else if(BUILDER_MODEL_INFO[id])root=detailedInterior(id); else return null;
  const [name,description,dimensions]=BUILDER_MODEL_INFO[id];root.name=name;root.userData={...root.userData,builderObject:true,modelId:id,label:name,description,dimensions,animated:['canopy-tree','pine-tree','pond','lamp-post','floor-lamp'].includes(id)};
  root.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;child.userData.builderRoot=root;}});return root;
}

export function updateBuilderModels(group, elapsed) {
  group.children.forEach(root=>{root.traverse(child=>{if(child.userData.water){child.material.opacity=.72+Math.sin(elapsed*1.4)*.06;child.rotation.z=elapsed*.025;}if(child.userData.swayPhase!==undefined)child.rotation.z=Math.sin(elapsed*.65+child.userData.swayPhase)*.025;});});
}
