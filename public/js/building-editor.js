export class BuildingEditor {
  constructor(THREE) { this.THREE=THREE; this.pending=null;this.spin=false; }
  begin(root,isNew=false) {
    if(this.pending)throw new Error('Finish or cancel the current edit first.');
    const colors=[];root.traverse(mesh=>{if(mesh.isMesh)colors.push([mesh,mesh.material.color.clone()]);});
    this.pending={root,isNew,position:root.position.clone(),rotation:root.rotation.clone(),scale:root.scale.clone(),colors};
    this.values={x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1};this.spin=false;
  }
  set(key,value) {
    if(!this.pending||!Object.hasOwn(this.values,key)||!Number.isFinite(Number(value)))return;
    const limit=key==='scale'?[.25,3]:key.startsWith('r')?[-180,180]:[-5,5];
    this.values[key]=Math.max(limit[0],Math.min(limit[1],Number(value)));this.apply();
  }
  apply() {
    if(!this.pending)return;
    const {root,position,rotation,scale}=this.pending,v=this.values;
    root.position.copy(position).add(new this.THREE.Vector3(v.x,v.y,v.z));
    root.rotation.set(rotation.x+v.rx*Math.PI/180,rotation.y+v.ry*Math.PI/180,rotation.z+v.rz*Math.PI/180);
    root.scale.copy(scale).multiplyScalar(v.scale);root.updateMatrixWorld(true);
  }
  paint(color) { this.pending?.root.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.brickPaintPart)mesh.material.color.set(color);}); }
  update(delta) {if(this.spin&&this.pending){this.values.ry=(this.values.ry+delta*45+180)%360-180;this.apply();}}
  confirm() {const edit=this.pending;this.pending=null;this.spin=false;return edit;}
  cancel() {
    const edit=this.pending;if(!edit)return null;
    if(edit.isNew){edit.root.removeFromParent();edit.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});}
    else {edit.root.position.copy(edit.position);edit.root.rotation.copy(edit.rotation);edit.root.scale.copy(edit.scale);for(const [mesh,color]of edit.colors)mesh.material.color.copy(color);edit.root.updateMatrixWorld(true);}
    this.pending=null;this.spin=false;return edit;
  }
}

export class BuildingPreview {
  constructor(THREE,canvas) {
    this.THREE=THREE;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2));this.scene=new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x39444e,2));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,6,5);this.scene.add(light);
    this.camera=new THREE.PerspectiveCamera(38,1,.01,100);this.root=null;
  }
  set(root) {
    this.clear();root.traverse(mesh=>{if(mesh.isMesh)mesh.userData.previewSourceId=mesh.id;});this.root=root.clone(true);
    this.root.traverse(mesh=>{if(mesh.isMesh){mesh.geometry=mesh.geometry.clone();mesh.material=mesh.material.clone();mesh.material.depthTest=true;}});
    this.root.position.set(0,0,0);this.scene.add(this.root);this.render(root);
  }
  render(source) {
    if(!this.root)return;this.root.rotation.copy(source.rotation);this.root.scale.copy(source.scale);
    const T=this.THREE,box=new T.Box3().setFromObject(this.root),center=box.getCenter(new T.Vector3()),size=Math.max(.5,box.getSize(new T.Vector3()).length());
    this.camera.position.copy(center).add(new T.Vector3(size*.9,size*.65,size*1.2));this.camera.lookAt(center);
    const canvas=this.renderer.domElement,w=Math.max(240,canvas.clientWidth),h=Math.max(200,canvas.clientHeight);
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.root.traverse(mesh=>{if(mesh.isMesh){const original=source.getObjectById(mesh.userData.previewSourceId);if(original)mesh.material.color.copy(original.material.color);}});
    this.renderer.render(this.scene,this.camera);
  }
  clear(){if(this.root){this.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});this.root.removeFromParent();this.root=null;}}
  dispose(){this.clear();this.renderer.dispose();}
}

export function applyDropSettings(THREE,root,values) {
  root.position.add(new THREE.Vector3(values.x,values.y,values.z));
  root.rotation.x+=values.rx*Math.PI/180;root.rotation.y+=values.ry*Math.PI/180;root.rotation.z+=values.rz*Math.PI/180;
  root.scale.multiplyScalar(values.scale);root.updateMatrixWorld(true);
  return root;
}
