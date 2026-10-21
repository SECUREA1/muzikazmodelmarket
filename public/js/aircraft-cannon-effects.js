import * as THREE from '../vendor/three/three.module.min.js';
import {AIRCRAFT_CANNON_PORTS} from './aircraft-model.js';
import {AIRCRAFT_GUN_RANGE} from './aircraft-combat.js';

const noRaycast=()=>{};
const finitePosition=value=>Number.isFinite(value?.x)&&Number.isFinite(value?.y)&&Number.isFinite(value?.z);
const component=(value,index,key)=>Array.isArray(value)?value[index]:value?.[key];

// Cosmetic only: shared geometry and fixed instance buffers are allocated once.
// A volley never creates meshes, lights, materials, vectors, or gameplay hits.
export class AircraftCannonEffects {
 constructor({scene=null,capacity=24,range=AIRCRAFT_GUN_RANGE,speed=300,convergence=150}={}){
  this.capacity=Math.max(1,Math.min(96,Math.floor(Number(capacity)||24)));
  this.range=Math.max(10,Math.min(AIRCRAFT_GUN_RANGE,Number(range)||AIRCRAFT_GUN_RANGE));
  this.speed=Math.max(30,Number(speed)||300);this.convergence=Math.max(10,Math.min(this.range,Number(convergence)||150));
  this.tracerLength=8;this.flashLifetime=.07;this.lifetime=this.range/this.speed;
  this.root=new THREE.Group();this.root.name='AIRCRAFT_CANNON_VISUAL_EFFECTS';this.root.userData.collisionDisabled=true;this.root.userData.collider=false;this.root.visible=false;
  this.tracerGeometry=new THREE.CylinderGeometry(1,1,1,5,1);
  this.flashGeometry=new THREE.IcosahedronGeometry(1,0);
  this.glowMaterial=new THREE.MeshBasicMaterial({color:0xff9a38,transparent:true,opacity:.62,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  this.coreMaterial=new THREE.MeshBasicMaterial({color:0xfff7d9,transparent:true,opacity:.96,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  this.flashMaterial=new THREE.MeshBasicMaterial({color:0xffd687,transparent:true,opacity:.92,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const count=this.capacity*2;
  this.glow=new THREE.InstancedMesh(this.tracerGeometry,this.glowMaterial,count);
  this.core=new THREE.InstancedMesh(this.tracerGeometry,this.coreMaterial,count);
  this.flashes=new THREE.InstancedMesh(this.flashGeometry,this.flashMaterial,count);
  const batches=[this.glow,this.core,this.flashes];
  for(let index=0;index<batches.length;index++){
   const batch=batches[index];batch.name=['AIRCRAFT_CANNON_TRACER_GLOW','AIRCRAFT_CANNON_TRACER_CORE','AIRCRAFT_CANNON_MUZZLE_FLASH'][index];
   batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.frustumCulled=false;batch.raycast=noRaycast;batch.userData.collisionDisabled=true;batch.userData.collider=false;
   this.root.add(batch);
  }
  this.slots=new Array(this.capacity);
  for(let index=0;index<this.capacity;index++)this.slots[index]={active:false,fresh:false,age:0,origins:[new THREE.Vector3(),new THREE.Vector3()],directions:[new THREE.Vector3(),new THREE.Vector3()],orientations:[new THREE.Quaternion(),new THREE.Quaternion()]};
  this._position=new THREE.Vector3();this._aimOrigin=new THREE.Vector3();this._aimDirection=new THREE.Vector3();this._aimTarget=new THREE.Vector3();this._scale=new THREE.Vector3();this._up=new THREE.Vector3(0,1,0);
  this._rotation=new THREE.Euler(0,0,0,'YXZ');this._orientation=new THREE.Quaternion();this._matrix=new THREE.Matrix4();this._hiddenMatrix=new THREE.Matrix4().makeScale(0,0,0);
  this.cursor=0;this.activeCount=0;this.disposed=false;this.reset();scene?.add(this.root);
 }
 fire(actor,shot){
  if(this.disposed||!finitePosition(actor?.position)||actor.active===false||Number.isFinite(actor.health)&&actor.health<=0)return false;
  const rotation=actor.rotation;
  this._rotation.set(Number.isFinite(rotation?.x)?rotation.x:0,Number.isFinite(rotation?.y)?rotation.y:0,Number.isFinite(rotation?.z)?rotation.z:0,'YXZ');
  this._orientation.setFromEuler(this._rotation);
  const scale=actor.scale,sx=Number.isFinite(scale?.x)&&scale.x>0?scale.x:1,sy=Number.isFinite(scale?.y)&&scale.y>0?scale.y:1,sz=Number.isFinite(scale?.z)&&scale.z>0?scale.z:1;
  const direction=shot?.direction;
  if(direction!==undefined){
   const x=component(direction,0,'x'),y=component(direction,1,'y'),z=component(direction,2,'z');
   if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||Math.hypot(x,y,z)<1e-6)return false;
   this._aimDirection.set(x,y,z).normalize();
  }else this._aimDirection.set(0,0,-1).applyQuaternion(this._orientation);
  if(finitePosition(shot?.origin))this._aimOrigin.copy(shot.origin);
  else this._aimOrigin.set(0,sy,-4.3*sz).applyQuaternion(this._orientation).add(actor.position);
  this._aimTarget.copy(this._aimOrigin).addScaledVector(this._aimDirection,this.convergence);
  const slot=this.slots[this.cursor],slotIndex=this.cursor;this.cursor=(this.cursor+1)%this.capacity;
  if(!slot.active)this.activeCount++;
  slot.active=true;slot.fresh=true;slot.age=0;
  for(let side=0;side<2;side++){
   const port=AIRCRAFT_CANNON_PORTS[side],origin=slot.origins[side],aim=slot.directions[side];
   origin.set(port[0]*sx,port[1]*sy,port[2]*sz).applyQuaternion(this._orientation).add(actor.position);
   aim.copy(this._aimTarget).sub(origin).normalize();slot.orientations[side].setFromUnitVectors(this._up,aim);
  }
  this._renderSlot(slot,slotIndex);this.root.visible=true;this._dirty();return true;
 }
 _hideSlot(index){
  for(let side=0;side<2;side++){
   const instance=index*2+side;
   this.glow.setMatrixAt(instance,this._hiddenMatrix);this.core.setMatrixAt(instance,this._hiddenMatrix);this.flashes.setMatrixAt(instance,this._hiddenMatrix);
  }
 }
 _renderSlot(slot,index){
  const head=Math.min(this.range,this.tracerLength+slot.age*this.speed),tail=Math.max(0,head-this.tracerLength),length=head-tail;
  const fade=Math.min(1,Math.max(0,(this.lifetime-slot.age)/.12)),flash=Math.max(0,1-slot.age/this.flashLifetime);
  for(let side=0;side<2;side++){
   const instance=index*2+side,origin=slot.origins[side],direction=slot.directions[side],orientation=slot.orientations[side];
   this._position.copy(origin).addScaledVector(direction,(head+tail)*.5);
   this._scale.set(.046*fade,length,.046*fade);this._matrix.compose(this._position,orientation,this._scale);this.glow.setMatrixAt(instance,this._matrix);
   this._scale.set(.016*fade,length,.016*fade);this._matrix.compose(this._position,orientation,this._scale);this.core.setMatrixAt(instance,this._matrix);
   if(flash>0){this._scale.set(.18*flash,.62*flash,.18*flash);this._matrix.compose(origin,orientation,this._scale);this.flashes.setMatrixAt(instance,this._matrix);}
   else this.flashes.setMatrixAt(instance,this._hiddenMatrix);
  }
 }
 _dirty(){this.glow.instanceMatrix.needsUpdate=true;this.core.instanceMatrix.needsUpdate=true;this.flashes.instanceMatrix.needsUpdate=true;}
 update(delta){
  if(this.disposed||!this.activeCount)return;
  const dt=Number.isFinite(delta)?Math.max(0,Math.min(2,delta)):0;
  for(let index=0;index<this.capacity;index++){
   const slot=this.slots[index];if(!slot.active)continue;
   // Keep a newly emitted muzzle visible for its first rendered frame even
   // when the preceding frame was slow; that elapsed time predates the shot.
   if(slot.fresh)slot.fresh=false;else slot.age+=dt;
   if(slot.age>=this.lifetime){slot.active=false;this.activeCount--;this._hideSlot(index);}else this._renderSlot(slot,index);
  }
  this.root.visible=this.activeCount>0;this._dirty();
 }
 reset(){
  if(this.disposed)return;
  for(let index=0;index<this.capacity;index++){const slot=this.slots[index];slot.active=false;slot.fresh=false;slot.age=0;this._hideSlot(index);}
  this.activeCount=0;this.cursor=0;this.root.visible=false;this._dirty();
 }
 dispose(){
  if(this.disposed)return;this.reset();this.disposed=true;this.root.removeFromParent();this.glow.dispose();this.core.dispose();this.flashes.dispose();this.tracerGeometry.dispose();this.flashGeometry.dispose();this.glowMaterial.dispose();this.coreMaterial.dispose();this.flashMaterial.dispose();
 }
}
