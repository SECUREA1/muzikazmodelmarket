import {previewDescriptor,previewModelSource,loadPreviewModel,disposePreviewModel} from './market-item-preview.js';

const retailBuildings=new Set(['general-store','corner-bakery','community-supermarket','fashion-boutique','neighborhood-pharmacy','artisan-workshop']);
const retailLayouts=new Set(['vendor-street','market-square','mega-mall']);
export const STORE_DISPLAY_LIMITS=Object.freeze({displays:6,concurrentLoads:2,cachedSources:8,meshes:160,triangles:80000});
export function storeProductIdentity(record={}){
 if(/^(?:player|builder):/.test(record.id||''))return record.id;
 if(record.sellerId&&record.itemId)return 'player:'+record.sellerId+':'+record.itemId;
 if(record.listing_id||record.listingId)return 'builder:'+(record.listing_id||record.listingId);
 return String(record.sku||record.itemId||record.sourceId||record.id||record.asset?.id||record.model?.id||'');
}
export function storeProductLabel(record={}){
 const name=record.asset?.name||record.model?.name||record.name||record.itemName||'Market item',mzk=Number(record.priceMzk??record.price_mzk),usd=Number(record.priceUsd);
 const price=record.basic?'Basic kit · free':Number.isFinite(mzk)&&mzk>0?mzk.toLocaleString()+' MZK':Number.isFinite(usd)&&usd>0?'USD '+usd.toFixed(2):record.earnedWorld?'Earned collectible':'View current offer';
 return {name:String(name),price};
}
function descriptorKey(item){
 const {id,sku,name,image,category,icon,entries,...visual}=item;
 // A card's text is its visual content. Only authored model aliases can omit
 // the offer's name/category/entries when sharing a cached source.
 return JSON.stringify(previewModelSource(item)==='card'?{...visual,name,category,entries}:visual);
}
// A source can appear under more than one sale identity. Deduplicate only the
// display model; the original record, SKU and price are retained for inspection.
export function storeDisplayProducts(records=[]){
 const groups=new Map(),seen=new Set();
 for(const record of records){
  const item=previewDescriptor(record),source=previewModelSource(item);
  if(!source)continue;const key=descriptorKey(item);if(seen.has(key))continue;seen.add(key);
  if(!groups.has(source))groups.set(source,[]);groups.get(source).push({record,item,key,identity:storeProductIdentity(record)});
 }
 const result=[],order=['native','glb','generated','drawing','material','tool','image','card','layout'];
 while(groups.size)for(const source of new Set([...order,...groups.keys()])){
  const items=groups.get(source);if(!items)continue;result.push(items.shift());if(!items.length)groups.delete(source);
 }
 return result;
}

// Coordinates are local to the existing fixture. Nothing is attached to an
// entrance, a market control deck, the road or the centre of a shop aisle.
export function storeDisplaySlots(THREE,root){
 const id=root.userData.modelId||root.userData.interactiveDevice||'',slots=[];
 const slot=(parent,key,position,size,rotation=0,stand=false,hide=[],labelAt=null)=>slots.push({parent,key,position,size,rotation,stand,hide,labelAt});
 if(id==='market-stall'){
  const fruit=[];root.traverse(node=>{if(node.name==='MARKET_PRODUCE')fruit.push(node);});
  for(let i=0;i<3;i++)slot(root,'tray-'+i,[(i-1)*.76,1.155,-.66],[.54,.88,.43],0,false,fruit.filter(node=>Math.abs(node.position.x-(i-1)*.76)<.32),[0,.04,-.277]);
 }else if(id==='market-atm'||id==='item-vending-machine'){
  const idle=[];root.traverse(node=>{if(node.name==='DEVICE_IDLE_DISPLAY')idle.push(node);});
  // The real device screen remains the backdrop. Its buttons, media-screen
  // identity and interaction roles stay on the original cabinet.
  slot(root,'screen-window',[0,.89,-.355],[1.03,.86,.17],0,true,idle,[0,-.075,-.089]);
 }else if(root.userData.materialId==='display-plinth'||id==='material:display-plinth'){
  slot(root,'plinth',[0,.605,0],[.94,1.20,.94]);
 }else if(retailBuildings.has(id)){
  const counter=root.getObjectByName('COUNTER_TOP');
  if(counter?.geometry?.parameters){
   const p=counter.geometry.parameters;
   for(let i=0;i<3;i++)slot(root,'counter-'+i,[counter.position.x+(i-1)*Math.min(1.1,p.width*.24),counter.position.y+p.height/2+.006,counter.position.z],[.86,1.20,Math.min(.86,p.depth*.80)]);
  }else{
   const interior=root.userData.interiorBounds;
   if(interior)for(const side of [-1,1])slot(root,'window-'+side,[side*(interior.max.x-interior.min.x)*.34,interior.min.y+.68,interior.min.z+.95],[1.05,1.35,.80],0,true);
  }
 }
 if(retailLayouts.has(root.userData.layout)){
  let index=0;
  for(const node of root.children){
   if(node.name!=='BUILDER_TEMPLATE_'+root.userData.layout||!node.geometry?.parameters)continue;
   const p=node.geometry.parameters;if(p.height<1.8)continue;
   if(root.userData.layout==='vendor-street'){
    const side=node.position.x<0?1:-1;slot(node,'shop-'+index++,[side*(p.width/2+.22),-.48,0],[1.08,.94,.40],side*Math.PI/2,true);
   }else if(root.userData.layout==='market-square')slot(node,'shop-'+index++,[-p.width/2-.22,-.36,0],[1.08,.94,.40],-Math.PI/2,true);
   else slot(node,'shop-'+index++,[0,-.48,-p.depth/2-.22],[1.08,.94,.40],0,true);
  }
 }
 return slots;
}

let skeletonModule;
async function displayClone(source){
 const {clone:cloneSkeleton}=await (skeletonModule ||= import('../vendor/three/addons/utils/SkeletonUtils.js'));
 // Product copies deliberately have no playable rig, actor ID or server device
 // roles. Temporarily omitting factory userData also avoids cyclic rig pointers
 // during Three's clone. Geometry, textures and materials belong to the cache.
 const metadata=[];source.traverse(node=>{metadata.push([node,node.userData]);node.userData={};});
 let copy;try{copy=cloneSkeleton(source);}finally{for(const [node,data]of metadata)node.userData=data;}
 const remove=[];copy.traverse(node=>{
  node.userData={storeProductDisplay:true,collisionDisabled:true,collider:false};
  node.castShadow=false;node.receiveShadow=true;
  if(node.isLight||node.isCamera||node.isAudio)remove.push(node);
 });for(const node of remove)node.removeFromParent();return copy;
}
function releaseDisplayClone(root){
 const skeletons=new Set();root?.traverse(node=>{if(node.isInstancedMesh)node.dispose();if(node.isSkinnedMesh&&node.skeleton)skeletons.add(node.skeleton);});
 for(const skeleton of skeletons)skeleton.dispose();
}

export function createStoreProductDisplays({THREE,getRoots=()=>[],getPosition=()=>new THREE.Vector3(),loadProducts,loadModel=loadPreviewModel,disposeModel=disposePreviewModel,maxDisplays=6,loadDistance=28,unloadDistance=40,onSelect=()=>{}}={}){
 if(!THREE)throw Error('Store displays need Three.js.');
 maxDisplays=Math.max(0,Math.min(STORE_DISPLAY_LIMITS.displays,Math.floor(maxDisplays)||0));
 const fixtures=new Map(),templates=new Map(),jobs=[],hidden=new Map();
 const standGeometry=new THREE.BoxGeometry(1,1,1),standMaterial=new THREE.MeshStandardMaterial({color:0x243e44,roughness:.46,metalness:.48});
 const point=new THREE.Vector3(),pickPoint=new THREE.Vector3(),pickRay=new THREE.Ray(),pickInverse=new THREE.Matrix4();let products=[],catalogPromise=null,catalogError='',disposed=false,elapsed=Infinity,inFlight=0,cursor=0,loadingCatalog=false;
 const fetchProducts=loadProducts||(async()=>{
  const request=globalThis.window?.MUZIKAZ_API?.fetch?.bind(globalThis.window.MUZIKAZ_API)||globalThis.fetch;
  const response=await request('/api/market/catalog',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}),payload=await response.json();
  if(!response.ok||payload.success===false)throw Error('Store products unavailable.');return payload.data||[];
 });
 function priceCard(product,size,position){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const context=canvas.getContext('2d');if(!context)return null;
  const label=storeProductLabel(product.record);context.fillStyle='#10282e';context.fillRect(0,0,512,128);context.strokeStyle='#88cbbf';context.lineWidth=4;context.strokeRect(3,3,506,122);
  context.fillStyle='#f0faf6';context.font='600 31px system-ui';context.fillText(label.name,17,48,478);context.fillStyle='#b7efc4';context.font='700 29px system-ui';context.fillText(label.price,17,98,478);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(.66,size[0]*.92),.14),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}));
  mesh.name='STORE_PRODUCT_PRICE_CARD';mesh.rotation.y=Math.PI;mesh.position.fromArray(position||[0,.085,-size[2]/2-.012]);mesh.userData={storeProductDisplay:true,collisionDisabled:true,collider:false};return mesh;
 }
 function catalog(){
  if(!catalogPromise){loadingCatalog=true;catalogPromise=Promise.resolve().then(fetchProducts).then(records=>{if(!disposed)products=storeDisplayProducts(records);}).catch(error=>{catalogError=error.message||'Store products unavailable.';}).finally(()=>{loadingCatalog=false;});}
  return catalogPromise;
 }
 function showOriginal(node,hide){
  if(hide){let state=hidden.get(node);if(!state){state={count:0,visible:node.visible};hidden.set(node,state);}state.count++;node.visible=false;}
  else{const state=hidden.get(node);if(state&&!--state.count){node.visible=state.visible;hidden.delete(node);}}
 }
 function trimCache(){
  const free=[...templates.values()].filter(entry=>entry.root&&!entry.users).sort((a,b)=>a.used-b.used);
  while(templates.size>STORE_DISPLAY_LIMITS.cachedSources&&free.length){const entry=free.shift();templates.delete(entry.key);disposeModel(entry.root);}
 }
 function pump(){
  while(!disposed&&inFlight<STORE_DISPLAY_LIMITS.concurrentLoads&&jobs.length){
   const entry=jobs.shift();inFlight++;
   Promise.resolve().then(()=>loadModel(entry.item,{signal:entry.controller.signal})).then(loaded=>{
    const root=loaded?.root||loaded;if(!root?.isObject3D)throw Error('No product model');
    if(disposed){disposeModel(root);throw Error('Store closed');}
    let meshes=0,triangles=0;root.traverse(node=>{if(node.isMesh){meshes++;triangles+=((node.geometry?.index?.count||node.geometry?.attributes?.position?.count||0)/3)*(node.isInstancedMesh?node.count:1);}});
    if(meshes>STORE_DISPLAY_LIMITS.meshes||triangles>STORE_DISPLAY_LIMITS.triangles){disposeModel(root);throw Error('Product exceeds the physical display budget');}
    entry.root=root;entry.resolve(root);
   }).catch(error=>{if(templates.get(entry.key)===entry)templates.delete(entry.key);entry.reject(error);}).finally(()=>{inFlight--;pump();trimCache();});
  }
 }
 function template(product){
  let entry=templates.get(product.key);
  if(!entry){
   let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});
   entry={key:product.key,item:product.item,promise,resolve,reject,controller:new AbortController(),root:null,users:0,used:0};templates.set(product.key,entry);jobs.push(entry);
  }
  entry.users++;entry.used=Date.now();trimCache();pump();return entry;
 }
 function release(state){
  state.generation++;state.group?.removeFromParent();state.group=null;state.model=null;
  releaseDisplayClone(state.ownedCopy);state.ownedCopy=null;
  if(state.label){state.label.geometry.dispose();state.label.material.map.dispose();state.label.material.dispose();state.label=null;}
  for(const node of state.hidden||[])showOriginal(node,false);state.hidden=[];
  if(state.template){
   const entry=state.template;entry.users=Math.max(0,entry.users-1);entry.used=Date.now();state.template=null;
   const queued=jobs.indexOf(entry);if(!entry.users&&queued>=0){jobs.splice(queued,1);templates.delete(entry.key);entry.reject(Error('Display moved out of range'));}
  }
  state.status='idle';trimCache();
 }
 async function populate(state){
  if(!products.length||state.status!=='idle')return;state.status='loading';
  const product=products[cursor++%products.length],entry=template(product),generation=++state.generation;state.template=entry;state.product=product;
  try{
   const source=await entry.promise;if(disposed||state.generation!==generation||!fixtures.has(state.key))return;
   const copy=await displayClone(source);if(disposed||state.generation!==generation||!fixtures.has(state.key)){releaseDisplayClone(copy);return;}state.ownedCopy=copy;
   // Public GLTF previews and product cards present their +Z front to the
   // customer. Physical shop fronts face -Z; turn only the cosmetic copy.
   if(['glb','card'].includes(previewModelSource(product.item)))copy.rotation.y+=Math.PI;
   const bounds=new THREE.Box3().setFromObject(copy,true),size=bounds.getSize(new THREE.Vector3());
   if(bounds.isEmpty()||![...bounds.min,...bounds.max].every(Number.isFinite)||Math.max(...size.toArray())<=0)throw Error('Invalid product bounds');
   const scale=Math.min(...state.slot.size.map((value,axis)=>value/Math.max(.00001,size.getComponent(axis))));
   const model=new THREE.Group(),center=bounds.getCenter(new THREE.Vector3());model.add(copy);model.scale.setScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);model.userData={storeProductDisplay:true,collisionDisabled:true,collider:false};
   const group=new THREE.Group();group.name='STORE_PRODUCT_DISPLAY';group.userData={storeProductDisplay:true,storeProductIdentity:product.identity,collisionDisabled:true,collider:false};
   group.position.fromArray(state.slot.position);group.rotation.y=state.slot.rotation;group.add(model);
   if(state.slot.stand){const shelf=new THREE.Mesh(standGeometry,standMaterial);shelf.name='STORE_DISPLAY_SHELF';shelf.scale.set(state.slot.size[0]*1.03,.018,state.slot.size[2]*1.03);shelf.position.y=-.012;shelf.userData={storeProductDisplay:true,collisionDisabled:true,collider:false};group.add(shelf);}
   state.label=priceCard(product,state.slot.size,state.slot.labelAt);if(state.label)group.add(state.label);
   const [width,height,depth]=state.slot.size;
   const cardFront=(state.slot.labelAt?.[2]??(-depth/2-.012))-.005;
   state.hitBox=new THREE.Box3(new THREE.Vector3(-width*.52,-.15,Math.min(-depth*.52-.005,cardFront)),new THREE.Vector3(width*.52,height,depth*.52));
   state.slot.parent.add(group);state.group=group;state.model=model;state.hidden=state.slot.hide;for(const node of state.hidden)showOriginal(node,true);state.status='ready';state.error='';
  }catch(error){if(state.generation===generation){release(state);state.status='failed';state.retryAt=Date.now()+1000;state.error=error.message;}}
 }
 function scan(roots){
  const found=new Set(),visited=new Set(),stack=[...roots].reverse();let inspected=0;
  while(stack.length&&inspected++<5000){
   const root=stack.pop();if(!root||visited.has(root)||root.userData.storeProductDisplay)continue;visited.add(root);
   const slots=storeDisplaySlots(THREE,root);
   for(const slot of slots){const key=root.uuid+':'+slot.key;found.add(key);if(!fixtures.has(key))fixtures.set(key,{key,host:root,slot,generation:0,status:'idle',hidden:[],group:null,template:null});}
   if(!slots.length&&!root.isMesh&&(!root.userData.builderObject&&!root.userData.builderObjectId||retailLayouts.has(root.userData.layoutScene)))stack.push(...root.children);
  }
  for(const [key,state]of fixtures)if(!found.has(key)){release(state);fixtures.delete(key);}
 }
 function update(dt=.5){
  if(disposed||!maxDisplays)return;elapsed+=Math.max(0,Number(dt)||0);if(elapsed<.5)return;elapsed=0;
  const roots=[].concat(getRoots()||[]).filter(Boolean);scan(roots);
  const position=getPosition();if(!position)return;
  const ranked=[...fixtures.values()].map(state=>{state.slot.parent.updateWorldMatrix(true,false);point.fromArray(state.slot.position);state.slot.parent.localToWorld(point);return {state,distance:point.distanceTo(position)};}).sort((a,b)=>a.distance-b.distance);
  if(ranked.some(row=>row.distance<=loadDistance))catalog();
  const chosen=new Set(ranked.filter(row=>row.distance<=(row.state.status==='ready'?unloadDistance:loadDistance)).slice(0,maxDisplays).map(row=>row.state));
  for(const {state}of ranked){if(!chosen.has(state)){if(state.status!=='idle')release(state);}else if(products.length){if(state.status==='failed'&&Date.now()>=state.retryAt)state.status='idle';populate(state);}}
 }
 function productFor(node){for(let current=node;current;current=current.parent){const identity=current.userData.storeProductIdentity;if(identity!==undefined)for(const state of fixtures.values())if(state.group===current)return state.product?.record||null;}return null;}
 return {
  update,productFor,
  pick(raycaster,maxDistance=5){
   let nearest=null;
   for(const state of fixtures.values()){
    if(!state.group||!state.hitBox)continue;state.group.updateWorldMatrix(true,false);pickInverse.copy(state.group.matrixWorld).invert();pickRay.copy(raycaster.ray).applyMatrix4(pickInverse);
    if(!pickRay.intersectBox(state.hitBox,pickPoint))continue;pickPoint.applyMatrix4(state.group.matrixWorld);const distance=pickPoint.distanceTo(raycaster.ray.origin);
    if(distance>Math.min(maxDistance,raycaster.far??Infinity)||distance<(raycaster.near||0)||nearest&&distance>=nearest.distance)continue;
    nearest={product:state.product.record,point:pickPoint.clone(),distance};
   }
   return nearest;
  },
  select(node){const product=productFor(node);if(product){onSelect(product);return true;}return false;},
  snapshot(){return {loadingCatalog,catalogError,products:products.length,active:[...fixtures.values()].filter(state=>state.status==='ready').length,pending:inFlight,queued:jobs.length,cachedSources:templates.size,fixtures:[...fixtures.values()].map(state=>({key:state.key,status:state.status,productId:state.product?.identity||'',error:state.error||''}))};},
  dispose(){if(disposed)return;disposed=true;for(const state of fixtures.values())release(state);fixtures.clear();for(const entry of jobs.splice(0)){entry.reject(Error('Store closed'));templates.delete(entry.key);}for(const entry of templates.values()){entry.controller.abort();if(entry.root)disposeModel(entry.root);}templates.clear();standGeometry.dispose();standMaterial.dispose();}
 };
}
