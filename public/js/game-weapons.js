export const EXTRA_WEAPONS = Object.freeze({
  'scatter-shot': Object.freeze({label:'Scatter Shot',description:'Five pellets for close targets',damage:18,pellets:5,range:16,spread:.09,interval:.6,color:0xffb743,rays:5,score:1}),
  'marksman': Object.freeze({label:'Marksman',description:'Precise long-range shot, slower fire',damage:65,pellets:1,range:40,spread:0,interval:.75,color:0x7affac,rays:1,score:1.3}),
  'arc-carbine': Object.freeze({label:'Arc Carbine',description:'Quick electric shots with moderate damage',damage:28,pellets:1,range:24,spread:0,interval:.18,color:0x65a4ff,rays:1,score:1}),
});

export function weaponDirections(THREE, direction, profile) {
  const aim=direction.clone().normalize(),right=new THREE.Vector3().crossVectors(aim,new THREE.Vector3(0,1,0));
  if(right.lengthSq()<1e-6)right.crossVectors(aim,new THREE.Vector3(1,0,0));
  right.normalize();const up=new THREE.Vector3().crossVectors(right,aim).normalize();
  return Array.from({length:profile.pellets},(_,index)=>{
    if(index===0)return aim.clone();
    const angle=(index-1)*2*Math.PI/(profile.pellets-1);
    return aim.clone().addScaledVector(right,Math.cos(angle)*profile.spread).addScaledVector(up,Math.sin(angle)*profile.spread).normalize();
  });
}

export function fireWeapon(THREE, id, {origin,direction,cooldown=0,ammo=Infinity,raycast,damage,feedback}) {
  const profile=EXTRA_WEAPONS[id];
  if(!profile||cooldown>1e-6||ammo<=0||direction.lengthSq()===0)return null;
  const damaged=new Map();let hitAny=false;
  for(const aim of weaponDirections(THREE,direction,profile)){
    const end=origin.clone().addScaledVector(aim,profile.range),hit=raycast(origin,end);
    feedback(origin,aim,hit?.point||end,profile);
    if(hit){hitAny=true;damaged.set(hit.target.root,(damaged.get(hit.target.root)||0)+profile.damage);}
  }
  for(const [target,amount] of damaged)damage(target,amount);
  return {cooldown:profile.interval,ammo:Number.isFinite(ammo)?ammo-1:ammo,hitAny};
}
