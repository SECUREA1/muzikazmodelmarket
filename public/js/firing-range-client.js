/** Keep range scenery in the same coordinate system as authoritative targets. */
export async function openFiringRangeSession({client,prepare=()=>{},onReady=()=>{}}){
 if(!client?.ready)throw new Error('Join the live server before opening the firing range.');
 const snapshot=await client.send('range-ready');
 if(!snapshot?.firingRange)throw new Error('The server has not confirmed this firing range. Try joining the map again.');
 await prepare();
 onReady(snapshot);
 return snapshot;
}

export function createFiringRangeSceneBridge({THREE,getRoots}){
 let scenes=[],state=null;
 const point=new THREE.Vector3();
 function refresh(){
  scenes=[];const seen=new Set();
  for(const root of getRoots().filter(Boolean))root.traverse(node=>{
   if(typeof node.userData.setFiringRangeState!=='function'||seen.has(node))return;
   seen.add(node);scenes.push(node);
  });
 }
 function locationFor(root){
  let owner=root;while(owner&&!owner.userData.builderObjectId)owner=owner.parent;
  const exact=state?.locations?.find(location=>location.id===owner?.userData.builderObjectId);
  if(exact)return exact;
  root.getWorldPosition(point);
  return state?.locations?.slice().sort((a,b)=>point.distanceToSquared(new THREE.Vector3(a.transform.position.x,a.transform.position.y,a.transform.position.z))-point.distanceToSquared(new THREE.Vector3(b.transform.position.x,b.transform.position.y,b.transform.position.z)))[0];
 }
 return {
  refresh,
  render(next,serverTime){state=next;for(const root of scenes)root.userData.setFiringRangeState(next,{locationId:locationFor(root)?.id,serverTime});},
  update(serverTime){for(const root of scenes)root.userData.updateFiringRangeEffects?.(serverTime);},
  nearest(position){
   let best=null;
   for(const root of scenes)for(const interaction of root.userData.rangeInteractions||[]){
    const world=root.localToWorld(new THREE.Vector3(interaction.position.x,interaction.position.y,interaction.position.z));
    const distance=world.distanceTo(position);
    if(distance<=(interaction.radius||2.8)&&(!best||distance<best.distance))best={...interaction,distance,locationId:locationFor(root)?.id};
   }
   return best;
  },
  clear(){scenes=[];state=null;}
 };
}
