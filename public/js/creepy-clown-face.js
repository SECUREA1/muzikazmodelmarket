import * as T from '../vendor/three/three.module.min.js';

// A shared, nonphysical mask keeps every carnival character recognizable at
// avatar scale. The local origin is the head centre and the face looks along +Z.
export function createCreepyClownFace({radius=1,depth=1,nose=true,materials={}}={}){
 const root=new T.Group();root.name='CREEPY_CLOWN_FACE';root.scale.setScalar(radius);
 root.userData={collisionDisabled:true,creepyClownFace:true,creepyFaceVersion:1};
 const surface=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.76,...extra});
 const pallor=materials.pallor||surface('#e7e4dc'),ink=materials.ink||surface('#15111d'),crimson=materials.crimson||surface('#741a36'),ivory=materials.ivory||surface('#f8edd2'),iris=materials.iris||surface('#e4b96e',{emissive:'#9a452f',emissiveIntensity:.18});
 function group(name){const value=new T.Group();value.name=name;value.userData.collisionDisabled=true;root.add(value);return value;}
 function mesh(parent,geometry,material,name,x=0,y=0,z=0){const value=new T.Mesh(geometry,material);value.name=name;value.position.set(x,y,z);value.userData.collisionDisabled=true;parent.add(value);return value;}
 function polygon(parent,name,points,material,z){const shape=new T.Shape();points.forEach(([x,y],index)=>index?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();return mesh(parent,new T.ShapeGeometry(shape),material,name,0,0,z);}
 const face=mesh(root,new T.SphereGeometry(1,16,12),pallor,'CREEPY_CLOWN_PALLID_FACE');face.scale.set(.88,1.06,.88*depth);
 const eyes=group('CREEPY_CLOWN_EYE_MAKEUP'),brows=group('CREEPY_CLOWN_BROWS');
 for(const side of [-1,1]){
  const x=side*.32;
  polygon(eyes,'CREEPY_CLOWN_DARK_SOCKET',[[x-.2,.43],[x+.2,.43],[x+.16,.02],[x-.14,-.09]],ink,.89*depth);
  const pupil=mesh(eyes,new T.SphereGeometry(.07,10,8),iris,'CREEPY_CLOWN_NARROW_EYE',x,.23,.94*depth);pupil.scale.set(.5,1.3,.2);
  polygon(eyes,'CREEPY_CLOWN_TEAR',[[x-.08,.01],[x+.08,.01],[x+side*.06,-.44]],crimson,.91*depth);
  const brow=mesh(brows,new T.BoxGeometry(.51,.11,.025),ink,'CREEPY_CLOWN_SHARP_BROW',x,.6,.87*depth);brow.rotation.z=side*.29;
 }
 if(nose){const value=mesh(root,new T.SphereGeometry(.24,14,10),crimson,'CREEPY_CLOWN_RED_NOSE',0,0,1.02*depth);value.scale.z=depth;}
 const grin=group('CREEPY_CLOWN_GRIN'),outer=new T.Shape();
 outer.moveTo(-.67,-.18);outer.quadraticCurveTo(0,-.52,.67,-.18);outer.quadraticCurveTo(.53,-.79,0,-.8);outer.quadraticCurveTo(-.53,-.79,-.67,-.18);
 mesh(grin,new T.ShapeGeometry(outer),crimson,'CREEPY_CLOWN_GRIN_PAINT',0,0,.9*depth);
 const mouth=new T.Shape();mouth.moveTo(-.57,-.23);mouth.quadraticCurveTo(0,-.53,.57,-.23);mouth.quadraticCurveTo(.44,-.69,0,-.7);mouth.quadraticCurveTo(-.44,-.69,-.57,-.23);
 mesh(grin,new T.ShapeGeometry(mouth),ink,'CREEPY_CLOWN_MOUTH',0,0,.93*depth);
 const teeth=group('CREEPY_CLOWN_TEETH');
 for(let index=0;index<9;index++){const x=(index-4)*.11;mesh(teeth,new T.BoxGeometry(.077,.14,.018),ivory,'CREEPY_CLOWN_TOOTH',x,-.45+Math.abs(x)*.3,.96*depth);}
 for(let index=0;index<5;index++){const x=(index-2)*.15;mesh(teeth,new T.BoxGeometry(.075,.075,.018),ivory,'CREEPY_CLOWN_TOOTH',x,-.64+Math.abs(x)*.05,.96*depth);}
 return root;
}
