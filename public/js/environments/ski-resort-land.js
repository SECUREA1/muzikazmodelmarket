import * as THREE from '../../vendor/three/three.module.min.js';
import {SKI_SIZE,skiHeight,skiRuns,skiRunX,skiLifts,liftPosition,skiCourseGates} from '../ski-resort.js';
export function createSkiResortLand(){
 const root=new THREE.Group();root.name='PIXEL_PEAKS_SKI_RESORT';root.userData={proceduralLand:true,layout:'ski-resort',streetHeightAt:skiHeight,cleanSportsWorld:true};
 const mats=new Map(),mat=color=>{if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.85}));return mats.get(color);};
 const box=(name,x,y,z,w,h,d,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.name=name;m.position.set(x,y+h/2,z);m.castShadow=m.receiveShadow=true;root.add(m);return m;};
 const snow=new THREE.PlaneGeometry(SKI_SIZE,SKI_SIZE,300,300),p=snow.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i);p.setZ(i,skiHeight(x,z));const groomed=skiRuns.some(run=>Math.abs(x-skiRunX(run,z))<run.width/2&&z<310&&z>(run.id==='terrain-park'?-115:-415)),c=new THREE.Color(groomed?0xeaf7ff:0xc8dce9);c.multiplyScalar(.98+.02*Math.sin(x*.09)*Math.cos(z*.1));colors.push(c.r,c.g,c.b);}
 const kept=[],indices=snow.index;for(let i=0;i<indices.count;i+=3){const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2),x=(p.getX(a)+p.getX(b)+p.getX(c))/3,z=-(p.getY(a)+p.getY(b)+p.getY(c))/3;if(x>-100&&x<-60&&z>344&&z<376)continue;kept.push(a,b,c);}snow.setIndex(kept);
 snow.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));snow.computeVertexNormals();// Spatial tiles let floor rays reject distant snow instead of scanning the
 // entire mountain for each player movement step.
 const tiles=new Map(),normal=snow.attributes.normal;for(let i=0;i<kept.length;i+=3){const a=kept[i],key=Math.min(9,Math.floor((p.getX(a)+600)/120))+':'+Math.min(9,Math.floor((600-p.getY(a))/120));if(!tiles.has(key))tiles.set(key,{positions:[],colors:[],normals:[]});const tile=tiles.get(key);for(const v of kept.slice(i,i+3)){tile.positions.push(p.getX(v),p.getY(v),p.getZ(v));tile.colors.push(colors[v*3],colors[v*3+1],colors[v*3+2]);tile.normals.push(normal.getX(v),normal.getY(v),normal.getZ(v));}}
 const snowMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94});for(const [key,tile]of tiles){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tile.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(tile.colors,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(tile.normals,3));g.computeBoundingSphere();const terrain=new THREE.Mesh(g,snowMaterial);terrain.rotation.x=-Math.PI/2;terrain.name='BUILDER_WALKABLE_FLOOR_SKI_MOUNTAIN_'+key;terrain.userData.colliderShape='mesh';terrain.receiveShadow=true;root.add(terrain);}snow.dispose();
 for(const run of skiRuns)for(let z=280;z>= (run.id==='terrain-park'?-110:-390);z-=35)for(const side of [-1,1]){const x=skiRunX(run,z)+side*run.width/2,y=skiHeight(x,z);box('TRAIL_MARKER_'+run.id,x,y,z,.18,2,.18,0x465463);box('RUN_COLOR_'+run.id,x,y+1.4,z,.7,.5,.1,run.color);}
 for(const run of skiRuns)for(const [index,gate]of skiCourseGates(run).entries()){for(const side of [-1,1]){const x=gate.x+side*gate.width/2,y=skiHeight(x,gate.z);box('RACE_GATE_POLE_'+run.id+'_'+index,x,y,gate.z,.16,2.6,.16,0x42576b);box('RACE_GATE_FLAG_'+run.id+'_'+index,x-side*.55,y+1.4,gate.z,1.1,.75,.08,run.color);}if(index===skiCourseGates(run).length-1){const ribbon=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(gate.x-gate.width/2,gate.y+.04,gate.z),new THREE.Vector3(gate.x+gate.width/2,gate.y+.04,gate.z)]),new THREE.LineBasicMaterial({color:run.color}));ribbon.name='RACE_FINISH_LINE_'+run.id;root.add(ribbon);}}
 // Keep the wide groomed runs and lift boarding areas clear of trees.
 const crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(3.6,11,7),mat(0x244c48),135),caps=new THREE.InstancedMesh(new THREE.ConeGeometry(3,8,7),mat(0xe4f3fa),135),treeMatrix=new THREE.Matrix4();crowns.name='ALPINE_PINE_CROWNS';caps.name='SNOW_PINE_CAPS';crowns.userData.collider=false;caps.userData.collider=false;
 for(let i=0;i<135;i++){const z=-480+(i%27)*35,x=(i%2?-1:1)*(295+Math.floor(i/27)*45+12*Math.sin(i*2)),y=skiHeight(x,z);box('PINE_TRUNK',x,y,z,.65,6,.65,0x674e3e);crowns.setMatrixAt(i,treeMatrix.makeTranslation(x,y+8,z));caps.setMatrixAt(i,treeMatrix.makeTranslation(x,y+10,z));}root.add(crowns,caps);
 for(let z=280;z>=-80;z-=30){const x=-245+12*Math.sin(z*.02);box('HIKING_TRAIL_POLE',x,skiHeight(x,z),z,.15,1.4,.15,0xe5bb5b);}
 for(let i=0;i<17;i++){const x=-225+i*28,z=-480-22*Math.sin(i*1.7),y=skiHeight(x,z);const rock=new THREE.Mesh(new THREE.ConeGeometry(12+(i%3)*4,22+(i%4)*6,5),mat(0x667587));rock.name='SUMMIT_ROCK_OUTCROP';rock.position.set(x,y+5,z);rock.rotation.y=i;root.add(rock);}
 const chairs=[];
 for(const lift of skiLifts){
  const cablePoints=[-1.4,1.4].map(side=>Array.from({length:31},(_,i)=>{const p=liftPosition(lift,i/30);return new THREE.Vector3(p.x+side,p.y+2.7,p.z);}));
  for(const points of cablePoints){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x303f53}));line.name='CHAIRLIFT_CABLE';root.add(line);}
  for(let i=0;i<=10;i++){const p=liftPosition(lift,i/10),y=skiHeight(p.x,p.z);box('LIFT_TOWER',p.x,y,p.z,.7,p.y-y+2.7,.7,0x566577);box('LIFT_CROSSBEAM',p.x,p.y+2.3,p.z,6,.35,.6,0xf4b955);}
  for(const end of [lift.from,lift.to]){const y=skiHeight(end.x,end.z);box('LIFT_STATION_FOUNDATION',end.x+11,y-.2,end.z+8,18,.26,16,0x536b80);for(const side of [-1,1])box('LIFT_BOARDING_LANE',end.x+11+side*7,y+.06,end.z+8,.16,.025,13,0xffd069);box('LIFT_STATION_ROOF',end.x,y+8.5,end.z,13,.6,14,0x426582);for(const side of [-1,1])box('LIFT_STATION_POST',end.x+side*5.5,y,end.z,.4,8.5,.4,0x65768a);}
  for(let i=0;i<16;i++){const chair=new THREE.Group();chair.name='MOVING_CHAIR_'+lift.id;chair.userData={collisionDisabled:true,collider:false};const part=(x,y,z,w,h,d,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);chair.add(m);};part(0,0,0,3,.2,1.2,0xe4b54d);part(0,.6,.55,3,1.1,.15,0x37546c);part(0,1.5,.55,.12,2.4,.12,0x536174);root.add(chair);chairs.push({chair,lift,offset:i/16});}
 }
 // Chalet has a continuous ground floor, open central doorway, rooms and an
 // upper balcony reached by 24 shallow steps; every piece is real collision.
 box('CHATEAU_FLOOR',-80,0,360,40,.12,32,0x997358);
 box('CHATEAU_BACK_WALL',-80,.12,344,40,7,.5,0x746958);
 for(const x of [-100,-60])box('CHATEAU_SIDE_WALL',x,.12,360,.5,7,32,0x746958);
 for(const x of [-92,-68])box('CHATEAU_FRONT_WALL',x,.12,376,16,7,.5,0x746958);
 box('CHATEAU_DOOR_LINTEL',-80,3.4,376,8,3.7,.5,0x746958);
 box('CHATEAU_BALCONY_FLOOR',-80,4.32,350,39,.2,11,0x997358);
 for(let i=0;i<24;i++)box('CHATEAU_STAIR_'+i,-96,.12,368.15-i*.55,3.5,(i+1)*.175,.55,0xb99574);
 for(const z of [355.5]){for(const x of [-93,-64])box('BALCONY_RAIL',x,4.52,z,8,1,.14,0x8f7054);box('BALCONY_RAIL',-80,4.52,z,16,1,.14,0x8f7054);}
 for(const side of [-1,1]){const roof=box('CHATEAU_SNOW_ROOF',-80+side*10,8.6,360,23,.6,36,0xf0f6fa);roof.rotation.z=-side*.24;}
 for(const z of [344,376]){const shape=new THREE.Shape();shape.moveTo(-20,7);shape.lineTo(0,11);shape.lineTo(20,7);shape.closePath();const gable=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.5,bevelEnabled:false}),mat(0x746958));gable.name='CHATEAU_GABLE_WALL';gable.position.set(-80,.12,z-.25);root.add(gable);}
 for(const x of [-92,-68])box('CHATEAU_WINDOW',x,1.5,376.28,5,2,.06,0x80b9d4);
 box('CHIMNEY',-87,8,346,3,5,3,0x6e6a67);
 // Room divider leaves broad openings beside the dining and lounge areas.
 box('DINING_ROOM_DIVIDER',-69,.12,358,.3,3,8,0x927354);
 box('FIREPLACE_HEARTH',-80,.12,345.8,7,.18,3.2,0x555b61);
 for(const x of [-82.8,-77.2])box('FIREPLACE_STONE',x,.3,345.4,.7,3.2,2.2,0x6d7277);
 box('FIREPLACE_MANTEL',-80,3.3,345.4,6.4,.45,2.5,0x787e81);
 for(let i=0;i<5;i++){const flame=new THREE.Mesh(new THREE.ConeGeometry(.32+(i%2)*.1,.9+(i%3)*.2,7),new THREE.MeshBasicMaterial({color:i%2?0xffdf72:0xff8236}));flame.position.set(-81+i*.5,.95,346.1);flame.name='FIREPLACE_FLAME';flame.userData={collisionDisabled:true,collider:false};root.add(flame);}
 const glow=new THREE.PointLight(0xffae55,5,20,1.5);glow.position.set(-80,2.5,348);root.add(glow);
 for(const x of [-86,-74]){box('LOUNGE_SOFA_SEAT',x,.12,352,4,.55,1.5,0x873f45);box('LOUNGE_SOFA_BACK',x,.6,352.7,4,.9,.25,0x873f45);}
 box('LOUNGE_COFFEE_TABLE',-80,.12,353,3,.65,2,0x654935);
 for(const z of [353,361]){box('DINING_TABLE',-64,.12,z,4,1,2.3,0x795439);for(const side of [-1,1])box('DINING_BENCH',-64,.12,z+side*1.7,4,.5,.6,0x997455);}
 const hx=-245,hz=-40,hy=skiHeight(hx,hz);box('WARMING_HUT_FLOOR',hx,hy,hz,16,.12,12,0x987455);box('WARMING_HUT_BACK',hx,hy,hz-6,16,4,.4,0x745749);for(const side of [-1,1])box('WARMING_HUT_SIDE',hx+side*8,hy,hz,.4,4,12,0x745749);box('WARMING_HUT_ROOF',hx,hy+4,hz,18,.4,14,0xe3f1f8);
 const passengerVisuals=new Map();
 root.userData.updateSkiEffects=(time,players={},selfId=null,selfPosition=null)=>{for(const [id,player]of Object.entries(players)){if(!player.skiLift&&!player.skiing)continue;let visual=passengerVisuals.get(id);if(!visual){visual=new THREE.Group();visual.name='SKI_PLAYER_EQUIPMENT';visual.userData={collider:false,collisionDisabled:true};const chair=new THREE.Mesh(new THREE.BoxGeometry(2.5,.18,1.1),mat(0xe5ba59));chair.position.y=-.35;visual.add(chair);const skis=new THREE.Group();for(const side of [-1,1]){const ski=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,2.4),mat(0xf49c50));ski.position.set(side*.23,.04,0);skis.add(ski);}visual.add(skis);root.add(visual);passengerVisuals.set(id,visual);}visual.visible=true;const position=id===selfId&&selfPosition?selfPosition:player.position;visual.position.set(position.x,position.y,position.z);visual.rotation.y=player.skiHeading??player.yaw??0;visual.children[0].visible=!!player.skiLift&&player.skiLift.progress<=.96;visual.children[1].visible=!!player.skiing;}for(const [id,visual]of passengerVisuals)if(!players[id]?.skiLift&&!players[id]?.skiing)visual.visible=false;
for(const {chair,lift,offset}of chairs){const phase=(time/lift.duration+offset)%2,progress=phase<=1?phase:2-phase,p=liftPosition(lift,progress);chair.position.set(p.x+(phase<=1?-1.4:1.4),p.y,p.z);chair.rotation.y=phase<=1?0:Math.PI;}};
 // Batch visual boxes by finish while retaining exact, individually named
 // collision pieces. This cuts mobile draw calls without broad box colliders.
 const batches=new Map();for(const mesh of [...root.children]){if(!mesh.isMesh||mesh.geometry?.type!=='BoxGeometry')continue;mesh.updateMatrix();const size=mesh.geometry.parameters,key=mesh.material;let batch=batches.get(key);if(!batch){batch=[];batches.set(key,batch);}batch.push({mesh,matrix:mesh.matrix.clone().scale(new THREE.Vector3(size.width,size.height,size.depth))});mesh.visible=false;mesh.userData.collider=true;}
 for(const [material,items]of batches){const visual=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,items.length);visual.name='SKI_BATCHED_SCENERY';visual.userData.collider=false;for(const [index,item]of items.entries())visual.setMatrixAt(index,item.matrix);visual.castShadow=visual.receiveShadow=true;root.add(visual);}
 root.userData.updateSkiEffects(0);return root;
}
