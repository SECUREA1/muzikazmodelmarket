import * as THREE from '../vendor/three/three.module.min.js';
export function createHarborBoat(id){
 const root=new THREE.Group();root.name=id==='harbor-sailboat'?'Marina sailboat':'Harbor launch';root.userData={builderObject:true,modelId:id,watercraft:true};
 const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.15,...extra});
 const hull=new THREE.Shape();hull.moveTo(0,2.4);hull.lineTo(.95,1.2);hull.lineTo(.95,-1.9);hull.lineTo(-.95,-1.9);hull.lineTo(-.95,1.2);hull.closePath();
 const geometry=new THREE.ExtrudeGeometry(hull,{depth:.6,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.08,bevelThickness:.04});geometry.rotateX(-Math.PI/2);
 const body=new THREE.Mesh(geometry,material(id==='harbor-sailboat'?0xe9e3c8:0x176579));body.position.y=-.35;body.castShadow=body.receiveShadow=true;root.add(body);
 const box=(name,size,position,color)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color));mesh.name=name;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;};
 box('BOAT_DECK',[1.7,.1,3.5],[0,.3,.15],0x9f7954);
 for(const z of [-1.2,.8])box('BOAT_BENCH',[1.55,.25,.4],[0,.58,z],0xd4d4c5);
 box('BOAT_HELM',[.5,.65,.4],[.45,.65,-.5],0x273e48);
 for(const x of [-.85,.85])for(const z of [-1.7,.2,1.5])box('BOAT_RAIL_POST',[.045,.5,.045],[x,.52,z],0xc4d9de);
 for(const x of [-.85,.85])box('BOAT_RAIL',[.045,.045,3.2],[x,.78,-.1],0xc4d9de);
 if(id==='harbor-sailboat'){
  box('BOAT_MAST',[.09,4.6,.09],[0,2.5,.3],0xc6c8b9);
  const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([.08,.9,.3,.08,4.6,.3,.08,.9,-1.9],3));sail.computeVertexNormals();root.add(new THREE.Mesh(sail,material(0x9be3d9,{side:THREE.DoubleSide})));
 }else box('BOAT_MOTOR',[.55,.65,.4],[0,.1,2.02],0x263d45);
 return root;
}
