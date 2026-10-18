import {LAYOUT_SCENES} from './builder-layout-scenes.js';
import {createBuilderLand} from './environments/builder-land.js';

export function createLayoutSceneModel(THREE,id){
 const item=LAYOUT_SCENES[id];if(!item)return null;
 const root=new THREE.Group(),land=createBuilderLand({id,builderScene:{layout:item.layout,mapSize:40,layoutMeta:{color:0x687860}}});
 // Bake the floor origin into the child. The editor and server both position
 // the enclosing object by its feet, including after scaling and reloading.
 land.position.y-=new THREE.Box3().setFromObject(land).min.y;root.add(land);
 // Reactive range meshes use an Object3D reference in the authored world.
 // Placed templates must keep serializable metadata for Three's clone path.
 land.traverse(node=>{if(node.userData.rangeTarget?.isObject3D)node.userData.rangeTarget=true;});
 root.name=item.name;root.userData={builderObject:true,modelId:id,label:item.name,description:item.description,dimensions:item.dimensions,placementSurface:true,layoutScene:item.layout};
 return root;
}
