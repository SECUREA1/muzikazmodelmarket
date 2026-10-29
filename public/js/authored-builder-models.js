import * as THREE from '../vendor/three/three.module.min.js';
import {applyCustomItemAppearance} from './custom-item-appearance.js';
const authoredPoses=new WeakMap(),customContents=new WeakMap(),customWrappers=new WeakMap();
export function createSavedCustomModel(model){if(!model?.strokes?.length)return null;const root=new THREE.Group(),settings=model.drawingSettings||{},presets={solid:[1,1],sculpted:[1.65,1.8],lightweight:[.55,.35]},preset=presets[model.form]||presets.solid,depth=(Number(settings.depth)||.3)*preset[0],bevel=Math.min((Number(settings.bevel)||0)*preset[1],depth*.45),color=new THREE.Color(model.color||'#b9ff38'),material=new THREE.MeshStandardMaterial({color,roughness:model.form==='sculpted'?.2:.55,metalness:model.form==='sculpted'?.82:.05,emissive:model.form==='lightweight'?color:0x000000,emissiveIntensity:model.form==='lightweight'?.8:0}),point=p=>new THREE.Vector2((p.x-240)/100,(280-p.y)/100);const addShape=shape=>{const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2}),material);mesh.position.z=-depth/2;root.add(mesh);};model.strokes.forEach(stroke=>{const points=stroke.points||[];if(points.length<2)return;if(stroke.tool==='rectangle'){const a=point(points[0]),b=point(points.at(-1)),shape=new THREE.Shape();shape.moveTo(a.x,a.y);shape.lineTo(b.x,a.y);shape.lineTo(b.x,b.y);shape.lineTo(a.x,b.y);shape.closePath();addShape(shape);}else if(stroke.tool==='circle'){const a=point(points[0]),b=point(points.at(-1)),shape=new THREE.Shape();shape.absellipse(a.x,a.y,Math.max(Math.abs(b.x-a.x),.04),Math.max(Math.abs(b.y-a.y),.04),0,Math.PI*2);addShape(shape);}else{const vectors=points.map(p=>new THREE.Vector3((p.x-240)/100,(280-p.y)/100,0));if(vectors.length===2)vectors.splice(1,0,vectors[0].clone().lerp(vectors[1],.5));root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vectors),Math.max(3,vectors.length*2),Math.max(.025,(stroke.width||18)/200),8,false),material));}});root.rotation.x=-Math.PI/2;root.position.y=depth/2;return root;}
export function prepareAuthoredBuilderModel(root,definition={}){
 const content=customContents.get(root)||root;
 // Fitting is local to the authored content. Existing actor/Builder placement
 // poses must not change the next preview edit's scale or floor correction.
 const previousParent=content.parent;if(previousParent)previousParent.remove(content);
 if(!authoredPoses.has(content))authoredPoses.set(content,{position:content.position.clone(),quaternion:content.quaternion.clone(),scale:content.scale.clone()});
 const pose=authoredPoses.get(content);content.position.copy(pose.position);content.quaternion.copy(pose.quaternion);content.scale.copy(pose.scale);
 const bounds=new THREE.Box3().setFromObject(content),size=bounds.getSize(new THREE.Vector3()),target=Number(definition?.targetHeight);
 if(Number.isFinite(target)&&target>0&&size.y>0){content.scale.multiplyScalar(target/size.y);bounds.setFromObject(content);}if(!bounds.isEmpty())content.position.y-=bounds.min.y;
 const configuration=definition?.configuration&&typeof definition.configuration==='object'&&!Array.isArray(definition.configuration)?definition.configuration:null;
 if(configuration){
  applyCustomItemAppearance(THREE,content,configuration,{rebase:true});content.updateMatrixWorld(true);const fitted=new THREE.Box3().setFromObject(content);if(!fitted.isEmpty())content.position.y-=fitted.min.y;
  // Keep customization inside the placement pose: actor and Builder transforms
  // are applied to this outer wrapper without replacing the saved custom turn.
  let wrapper=customWrappers.get(content);if(!wrapper){wrapper=new THREE.Group();wrapper.name='Custom_Item_Appearance';customWrappers.set(content,wrapper);customContents.set(wrapper,content);if(previousParent)previousParent.add(wrapper);}wrapper.add(content);return wrapper;
 }
 if(customWrappers.has(content)){applyCustomItemAppearance(THREE,content,{}, {rebase:true});const wrapper=customWrappers.get(content);wrapper.add(content);return wrapper;}
 if(previousParent)previousParent.add(content);
 return content;
}
