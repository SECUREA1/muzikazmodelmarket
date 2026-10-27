import * as T from '../../vendor/three/three.module.min.js';
import {createTropicalIslandWorld,animateTropicalIslandWorld} from '../tropical-island-world.js';
import {ISLAND_EXPERIENCES,ISLAND_SOLIDS,ISLAND_DOCKS,ISLAND_BALLS,islandGroundHeight} from '../tropical-island-config.js';

/** The same resort artwork, with explicit metre-based native walking geometry. */
export function createTropicalIslandLand(environment={}) {
  const world=createTropicalIslandWorld(),root=world.root;
  root.userData={proceduralLand:true,layout:'tropical-island',cleanSportsWorld:true,streetHeightAt:islandGroundHeight};
  // Staff and boats belong to the authoritative room. Keeping their original
  // decorative copies here would create two guests/craft at the same location.
  for(const boat of world.boats)boat.root.removeFromParent();
  for(const guest of world.guests)guest.root.removeFromParent();
  world.boats=[];world.guests=[];
  const nativeFloors=new Set(['PEARL_BEACH','RESORT_GARDENS','GARDEN_INTERIOR','REEF_SAND_SHELF']);
  const physicalPosts=[];
  root.updateMatrixWorld(true);
  root.traverse(node=>{
    if(!node.isMesh)return;
    if(/PALM_TRUNK|CABANA_POST|PALAPA_POST|WELCOME_POST|LOOKOUT_POST|HAMMOCK_POST/.test(node.name)){
      const count=node.isInstancedMesh?node.count:1;
      for(let index=0;index<count;index++){
        const local=new T.Matrix4();if(node.isInstancedMesh)node.getMatrixAt(index,local);
        physicalPosts.push({geometry:node.geometry,matrix:node.matrixWorld.clone().multiply(local)});
      }
    }
    node.userData.collisionDisabled=true;
    if(nativeFloors.has(node.name)){
      node.name='BUILDER_WALKABLE_FLOOR_ISLAND_'+node.name;
      node.userData={...node.userData,collisionDisabled:false,walkableFloor:true,colliderShape:'mesh'};
    }
  });
  const hidden=new T.MeshBasicMaterial({visible:false}),cube=new T.BoxGeometry(1,1,1);
  function solid(name,geometry,matrix,{floor=false,material=hidden}={}){
    const mesh=new T.Mesh(geometry,material);mesh.name=name;
    mesh.applyMatrix4(matrix);mesh.userData={collider:true,colliderShape:'mesh',...(floor?{walkableFloor:true}:{})};root.add(mesh);return mesh;
  }
  for(const [index,box]of ISLAND_SOLIDS.entries()){
    const h=box.maxY-box.minY;
    const matrix=new T.Matrix4().compose(new T.Vector3((box.minX+box.maxX)/2,(box.minY+box.maxY)/2,(box.minZ+box.maxZ)/2),new T.Quaternion(),new T.Vector3(box.maxX-box.minX,h,box.maxZ-box.minZ));
    solid('COLLIDER_ISLAND_BUILDING_'+index,cube,matrix);
  }
  for(const [index,post]of physicalPosts.entries())solid('COLLIDER_ISLAND_POST_'+index,post.geometry,post.matrix);
  for(const [index,dock]of ISLAND_DOCKS.entries()){
    // The existing dock marker gives the visitor's feet height, including the
    // standard two-centimetre separation used by the shared walking engine.
    const top=dock.height-.02,w=dock.maxX-dock.minX,d=dock.maxZ-dock.minZ;
    solid('BUILDER_WALKABLE_FLOOR_ISLAND_DOCK_'+index,cube,new T.Matrix4().compose(new T.Vector3((dock.minX+dock.maxX)/2,top-.08,(dock.minZ+dock.maxZ)/2),new T.Quaternion(),new T.Vector3(w,.16,d)),{floor:true});
    // A real shallow approach bridge makes the .39m deck rise traversable with
    // the native .35m step limit, without snapping a visitor onto the pier.
    const start=dock.minX-2.2,end=dock.minX+.6,near=dock.minZ+.15,far=dock.maxZ-.15;
    const vertices=[start,.36,near,start,.36,far,end,top,far,end,top,near,start,.30,near,start,.30,far,end,.30,far,end,.30,near];
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setIndex([0,1,2,0,2,3,4,7,6,4,6,5,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]);geometry.computeVertexNormals();
    const rampMaterial=new T.MeshStandardMaterial({color:'#b39164',roughness:.85});
    const ramp=solid('BUILDER_WALKABLE_FLOOR_ISLAND_PIER_APPROACH_'+index,geometry,new T.Matrix4(),{floor:true,material:rampMaterial});ramp.receiveShadow=true;
  }
  const seabedGeometry=new T.CircleGeometry(96,96);seabedGeometry.rotateX(-Math.PI/2);
  solid('BUILDER_WALKABLE_FLOOR_ISLAND_SHALLOW_SWIM',seabedGeometry,new T.Matrix4().makeTranslation(0,-.65,0),{floor:true});
  const spawn=new T.Object3D();spawn.name='SPAWN_PLAYER';spawn.position.set(0,.38,24);root.add(spawn);
  for(const point of ISLAND_EXPERIENCES){
    const marker=new T.Object3D();marker.name='INTERACTION_ISLAND_'+point.id.toUpperCase().replaceAll('-','_');
    marker.position.set(point.x,point.y??.36,point.z);marker.userData.islandAction={stationId:point.id,kind:point.type,radius:point.radius};root.add(marker);
  }
  const balls=new Map();
  for(const [index,ball]of world.balls.entries()){
    const id=ISLAND_BALLS[index]?.id||'island-beach-ball-'+(index+1);ball.id=id;ball.root.name=id;balls.set(id,ball.root);
  }
  let lastElapsed=0;
  root.userData.setIslandState=(state={})=>{
    for(const ball of Array.isArray(state?.balls)?state.balls:[]){
      const node=balls.get(ball?.id),p=ball?.position;if(!node||!p||![p.x,p.y,p.z].every(Number.isFinite))continue;
      node.position.set(p.x,p.y,p.z);
      if(ball.rotation&&[ball.rotation.x,ball.rotation.y,ball.rotation.z].every(Number.isFinite))node.rotation.set(ball.rotation.x,ball.rotation.y,ball.rotation.z);
    }
  };
  root.userData.updateIslandEffects=(elapsed,reducedMotion=false,serverTime=Date.now())=>{
    const time=Math.max(0,Number(elapsed)||0),dt=Math.max(0,Math.min(.1,time-lastElapsed));lastElapsed=time;
    animateTropicalIslandWorld(world,reducedMotion?0:time,reducedMotion?0:dt);
  };
  root.userData.islandBalls=balls;
  root.userData.updateIslandEffects(0);
  return root;
}
