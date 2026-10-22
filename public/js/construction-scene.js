// A view of confirmed construction progress. Placement and earthworks belong to
// the room server; these meshes never submit or award construction work.
export function createConstructionScene(THREE,scene){
 const root=new THREE.Group();root.name='SHARED_CONSTRUCTION_PROGRESS';scene.add(root);
 const frame=new THREE.Group(),guides=new THREE.Group(),earth=new THREE.Group();root.add(frame,guides,earth);
 const steel=new THREE.MeshStandardMaterial({color:0x84939d,metalness:.7,roughness:.38});
 const slab=new THREE.MeshStandardMaterial({color:0x79838c,roughness:.95});
 const glass=new THREE.MeshStandardMaterial({color:0x3f839a,metalness:.45,roughness:.28,transparent:true,opacity:.66});
 const earthMaterial=new THREE.MeshStandardMaterial({color:0x805e3e,roughness:1});
 const dark=new THREE.MeshStandardMaterial({color:0x302a24,roughness:1});
 const cyan=new THREE.MeshBasicMaterial({color:0x70f7db,transparent:true,opacity:.68,depthWrite:false});
 const amber=new THREE.MeshBasicMaterial({color:0xffd46b,transparent:true,opacity:.75,depthWrite:false});
 const wire=new THREE.MeshBasicMaterial({color:0x77c5d8,wireframe:true,transparent:true,opacity:.12,depthWrite:false});
 const materials=[steel,slab,glass,earthMaterial,dark,cyan,amber,wire];
 let signature='',earthSignature='',target=null,targetRing=null;
 const clear=group=>{for(const child of [...group.children]){child.traverse(node=>node.geometry?.dispose());group.remove(child);}};
 const box=(parent,size,position,material=steel)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=material===steel;mesh.receiveShadow=true;mesh.userData.collisionDisabled=true;parent.add(mesh);return mesh;};
 function update(snapshot){
  const site=snapshot?.construction;root.visible=!!site;if(!site)return;
  const t=site.tower;if(!t)return;
  const placed=Math.max(0,Math.floor(t.placed||0)),perFloor=t.beamsPerFloor||4,floors=Math.floor(placed/perFloor),partial=placed%perFloor;
  const structures=Object.values(snapshot.actors||{}).filter(actor=>actor.active!==false&&actor.constructionStructure),physicalLevels=new Set(structures.filter(actor=>actor.constructionStructure.kind==='floor').map(actor=>actor.constructionStructure.floor)),glazedLevels=new Set(structures.filter(actor=>actor.constructionStructure.kind==='facade').map(actor=>actor.constructionStructure.floor));
  const x=t.x||0,z=t.z||0,base=t.baseY||0,h=t.floorHeight||4,w=t.width||18,d=t.depth||18,max=t.maxFloors||16;
  const nextSignature=JSON.stringify([x,z,base,h,w,d,max,placed,[...physicalLevels],[...glazedLevels]]);
  if(nextSignature!==signature){
   signature=nextSignature;clear(frame);clear(guides);
   box(frame,[w+2,.3,d+2],[x,base+.02,z],slab);
   const visibleFloors=Math.min(max,floors+(floors<max?1:0));
   for(let level=0;level<visibleFloors;level++){
    const y=base+level*h;
    if(!physicalLevels.has(level+1))for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2])box(frame,[.45,h,.45],[x+dx,y+h/2,z+dz]);
    const beams=level<floors?perFloor:partial;
    for(let side=0;!site.beams&&side<Math.min(4,beams);side++){
     const alongX=side%2===0;
     box(frame,alongX?[w+.5,.55,.42]:[.42,.55,d+.5],[x+(side===1?w/2:side===3?-w/2:0),y+h,z+(side===0?-d/2:side===2?d/2:0)]);
    }
    if(level<floors){
     if(!physicalLevels.has(level+1))box(frame,[w-.4,.16,d-.4],[x,y+h-.36,z],slab);
     // Facade follows the rising frame, keeping its top working floor open.
     if(glazedLevels.has(level+1)||level<floors-1||floors===max){
      box(frame,[w-.7,h-.7,.08],[x,y+h/2,z-d/2+.08],glass);
      box(frame,[.08,h-.7,d-.7],[x+w/2-.08,y+h/2,z],glass);
     }
    }
   }
   const ghost=box(guides,[w,max*h,d],[x,base+max*h/2,z],wire);ghost.name='PLANNED_SKYSCRAPER';
   targetRing=new THREE.Mesh(new THREE.TorusGeometry(1.35,.055,6,40),cyan);targetRing.rotation.x=Math.PI/2;targetRing.userData.collisionDisabled=true;guides.add(targetRing);
   const marker=box(guides,[w,.12,.5],[x,base+h,z-d/2],amber);marker.name='NEXT_STEEL_PLACEMENT';
   target=marker;
  }
  if(target)target.visible=targetRing.visible=!!t.target;
  if(t.target&&target){
   const p=t.target.position||t.target;
   target.position.set(p.x,p.y,p.z);targetRing.position.set(p.x,p.y+.13,p.z);
   const rotation=t.target.rotation?.y??t.target.yaw;
   if(Number.isFinite(rotation))target.rotation.y=rotation;
   target.visible=targetRing.visible=placed<max*perFloor;
  }
  const e=site.excavation;
  if(e){const nextEarth=JSON.stringify([e.x,e.z,e.radius,Math.floor((e.depth||0)*10),site.graded||0,site.stockpile?.volume||0]);if(nextEarth!==earthSignature){
   earthSignature=nextEarth;clear(earth);const r=e.radius||12,depth=Math.max(0,e.depth||0);
   const pit=new THREE.Mesh(new THREE.CylinderGeometry(r*.91,r*.82,.06,40),dark);pit.position.set(e.x,.025,e.z);pit.userData.collisionDisabled=true;earth.add(pit);
   for(let i=0;i<5;i++){const a=i*.55+.3,mound=new THREE.Mesh(new THREE.ConeGeometry(1.5+depth*.5,.3+depth*.9,9),earthMaterial);mound.position.set(e.x+Math.cos(a)*(r+2),(.3+depth*.9)/2,e.z+Math.sin(a)*(r+2));mound.userData.collisionDisabled=true;earth.add(mound);}
   const spoil=site.stockpile,grading=Math.min(1,(site.graded||0)/100);
   if(spoil?.volume>0){
    const height=Math.cbrt(spoil.volume)*.9*(1-grading*.6),radius=Math.max(1.3,Math.cbrt(spoil.volume)*1.2);
    const pile=new THREE.Mesh(new THREE.ConeGeometry(radius*(1+grading),height,12),earthMaterial);pile.name='DELIVERED_SPOIL';pile.position.set(spoil.x,height/2+.04,spoil.z);pile.userData.collisionDisabled=true;earth.add(pile);
   }
   if(grading>0&&spoil)box(earth,[8+grading*8,.04,6+grading*4],[spoil.x,.04,spoil.z],earthMaterial);
  }}
 }
 return {root,update,animate(elapsed){if(targetRing){const scale=1+Math.sin(elapsed*3)*.08;targetRing.scale.setScalar(scale);}if(target)target.material.opacity=.5+Math.sin(elapsed*2)*.2;},reset(){signature=earthSignature='';target=targetRing=null;clear(frame);clear(guides);clear(earth);root.visible=false;},dispose(){this.reset();root.removeFromParent();materials.forEach(material=>material.dispose());}};
}
