import * as T from '../vendor/three/three.module.min.js';

const COSTUME_NAME='FUNHOUSE_COSTUME';
const noRaycast=()=>{};

function createCostume() {
 const root=new T.Group();root.name=COSTUME_NAME;root.userData.collisionDisabled=true;
 const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.42,metalness:.06,...extra});
 const red=material('#e9385f'),cyan=material('#36d7de'),gold=material('#ffd053'),cream=material('#fff1d4'),sole=material('#402444',{roughness:.8}),chrome=material('#c4e6ec',{metalness:.7,roughness:.2});
 const sphereGeometry=new T.SphereGeometry(1,18,12),boxGeometry=new T.BoxGeometry(1,1,1);
 const add=(parent,geometry,mat,name,position,scale=[1,1,1])=>{
  const mesh=new T.Mesh(geometry,mat);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);
  mesh.userData.collisionDisabled=true;mesh.userData.collider=false;mesh.raycast=noRaycast;mesh.castShadow=false;
  parent.add(mesh);return mesh;
 };
 const sphere=(parent,mat,name,position,scale)=>add(parent,sphereGeometry,mat,name,position,scale);
 const box=(parent,mat,name,position,scale)=>add(parent,boxGeometry,mat,name,position,scale);
 const hat=new T.Group();hat.name='FUNHOUSE_PROPELLER_HAT';hat.userData.collisionDisabled=true;root.add(hat);
 const colors=[red,gold,cyan,red,gold,cyan];
 for(let i=0;i<6;i++)add(hat,new T.SphereGeometry(.255,8,8,i*Math.PI/3,Math.PI/3,0,Math.PI/2),colors[i],'FUNHOUSE_HAT_PANEL_'+i,[0,.01,0]);
 const band=add(hat,new T.TorusGeometry(.251,.026,6,36),cream,'FUNHOUSE_HAT_BAND',[0,.018,0]);band.rotation.x=Math.PI/2;
 // The glossy brim points forward along the avatar's usual negative Z axis.
 sphere(hat,cyan,'FUNHOUSE_HAT_BRIM',[0,.005,-.19],[.235,.025,.19]);
 box(hat,chrome,'FUNHOUSE_HAT_STEM',[0,.292,0],[.022,.12,.022]);
 const spinner=new T.Group();spinner.name='FUNHOUSE_HAT_SPINNER';spinner.position.y=.36;spinner.userData.collisionDisabled=true;hat.add(spinner);
 for(const [side,mat]of [[-1,red],[1,cyan]]){
  const blade=sphere(spinner,mat,'FUNHOUSE_PROPELLER_BLADE',[side*.155,0,0],[.19,.018,.065]);blade.rotation.z=side*.12;
 }
 sphere(spinner,gold,'FUNHOUSE_PROPELLER_HUB',[0,.008,0],[.045,.035,.045]);
 const shoes=new T.Group();shoes.name='FUNHOUSE_CLOWN_SHOES';shoes.userData.collisionDisabled=true;root.add(shoes);
 for(const side of [-1,1]){
  const shoe=new T.Group();shoe.name=side<0?'FUNHOUSE_LEFT_SHOE':'FUNHOUSE_RIGHT_SHOE';shoe.position.x=side*.16;shoe.rotation.y=side*-.12;shoe.userData.collisionDisabled=true;shoes.add(shoe);
  const upper=side<0?red:cyan;
  sphere(shoe,sole,'FUNHOUSE_SHOE_SOLE',[0,.05,-.11],[.18,.05,.38]);
  sphere(shoe,upper,'FUNHOUSE_SHOE_UPPER',[0,.145,-.07],[.16,.13,.32]);
  sphere(shoe,upper,'FUNHOUSE_SHOE_TOE',[0,.13,-.29],[.18,.12,.19]);
  sphere(shoe,cream,'FUNHOUSE_SHOE_TOE_CAP',[0,.142,-.37],[.135,.083,.1]);
  sphere(shoe,gold,'FUNHOUSE_SHOE_POMPOM',[0,.265,-.035],[.065,.055,.065]);
  for(const z of [-.04,-.095,-.15])for(const diagonal of [-1,1]){
   const lace=box(shoe,cream,'FUNHOUSE_SHOE_LACE',[0,.263+(z+.04)*.16,z],[.15,.014,.014]);lace.rotation.y=diagonal*.45;
  }
 }
 root.userData.hat=hat;root.userData.shoes=shoes;root.userData.spinner=spinner;
 return root;
}

/** Apply a map costume without replacing or recoloring the player's avatar. */
export function updateFunhouseCostume(root,costume={},elapsed=0,{height=1.8,reducedMotion=false}={}) {
 if(!root?.isObject3D)return null;
 let outfit=root.children.find(child=>child.name===COSTUME_NAME);
 const showHat=costume?.hat===true,showShoes=costume?.shoes===true;
 if(!outfit&&!showHat&&!showShoes)return null;
 if(!outfit){outfit=createCostume();root.add(outfit);}
 const safeHeight=Number.isFinite(height)&&height>0?height:1.8,scale=safeHeight/1.8;
 outfit.scale.setScalar(scale);
 outfit.userData.hat.position.y=1.74;
 outfit.userData.hat.visible=showHat;outfit.userData.shoes.visible=showShoes;
 outfit.visible=showHat||showShoes;
 outfit.userData.spinner.rotation.y=reducedMotion?0:(Number.isFinite(elapsed)?elapsed:0)*7;
 return outfit;
}

/** Only resources owned by this costume are disposed; the avatar is untouched. */
export function clearFunhouseCostume(root) {
 const outfit=root?.children?.find(child=>child.name===COSTUME_NAME);if(!outfit)return;
 const resources=new Set();outfit.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const mat of [].concat(node.material||[]))resources.add(mat);});
 outfit.removeFromParent();for(const resource of resources)resource.dispose();
}
