// Shared by local previews, placed renderers and server collision. No renderer
// or Three import is created merely by loading the factory controls.
const materialBases=new WeakMap(),transformBases=new WeakMap();
const number=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const finishes={metal:{metalness:.75,roughness:.25},wood:{metalness:.02,roughness:.9},plastic:{metalness:.05,roughness:.45},glass:{metalness:0,roughness:.1,transparent:true,opacity:.45},neon:{metalness:.1,roughness:.4},stone:{metalness:.02,roughness:1},matte:{metalness:0,roughness:1}};

export function applyCustomMaterialAppearance(THREE,material,configuration={}, {preserveColors=false}={}){
 if(!material)return material;
 let base=materialBases.get(material);
 if(!base){base={};for(const key of ['color','emissive'])if(material[key]?.clone)base[key]=material[key].clone();for(const key of ['metalness','roughness','transparent','opacity','emissiveIntensity'])if(key in material)base[key]=material[key];materialBases.set(material,base);}
 for(const [key,value] of Object.entries(base))if(value?.isColor)material[key].copy(value);else material[key]=value;
 const finish=configuration.material==='emissive'?'neon':configuration.material,profile=finishes[finish];
 if(!profile){material.needsUpdate=true;return material;}
 const color=/^#[a-f\d]{6}$/i.test(configuration.color||'')?new THREE.Color(configuration.color):base.color;
 if(!preserveColors&&material.color&&color)material.color.lerp(color,number(configuration.colorBlend,35,0,100)/100);
 for(const [key,value] of Object.entries(profile))if(key in material)material[key]=value;
 if(finish==='neon'&&material.emissive){material.emissive.copy(preserveColors?base.color||new THREE.Color('white'):color||base.color||new THREE.Color('white'));material.emissiveIntensity=preserveColors?.08:.7;}
 material.needsUpdate=true;return material;
}

/** Reapplying settings always starts from the authored pose, never from the
 * previous edited scale or rotation. A caller that refits geometry can rebase. */
export function applyCustomItemTransform(THREE,root,configuration={}, {rebase=false}={}){
 if(!root)return root;
 if(rebase||!transformBases.has(root))transformBases.set(root,{position:root.position.clone(),quaternion:root.quaternion.clone(),scale:root.scale.clone()});
 const base=transformBases.get(root);root.position.copy(base.position);root.quaternion.copy(base.quaternion);root.scale.copy(base.scale).multiplyScalar(number(configuration.scale,1,.1,5));
 const turn=number(configuration.orientation,0,-360,360)*Math.PI/180;
 root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),turn));return root;
}

export function applyCustomItemAppearance(THREE,root,configuration={},options={}){
 applyCustomItemTransform(THREE,root,configuration,options);
 root?.traverse(node=>{for(const material of [].concat(node.material||[]))applyCustomMaterialAppearance(THREE,material,configuration,options);});return root;
}
