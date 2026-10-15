export const EXTRA_WEAPONS = Object.freeze({
  'pulse-pistol': Object.freeze({label:'Pulse Pistol',description:'Light, fast short-range pulse',damage:20,pellets:1,range:20,spread:0,interval:.22,color:0xf3eb69,rays:1,score:1}),
  'twin-blaster': Object.freeze({label:'Twin Blaster',description:'Two energy bolts per shot',damage:24,pellets:2,range:22,spread:.018,interval:.4,color:0xff7adf,rays:2,score:1}),
  'heavy-bolt': Object.freeze({label:'Heavy Bolt',description:'High damage with a long recovery',damage:85,pellets:1,range:30,spread:0,interval:1.1,color:0xff8654,rays:1,score:1.2}),
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
  const profile=RANGED_WEAPONS[id];
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

export const RANGED_WEAPONS = Object.freeze({
  laser:Object.freeze({label:'Laser',damage:50,pellets:1,range:30,spread:0,interval:.2,color:0xff173d,rays:1,score:1}),
  'pulse-rifle':Object.freeze({label:'Pulse Rifle',damage:28,pellets:2,range:24,spread:.012,interval:.16,color:0x43d8ff,rays:2,score:1}),
  'rail-cannon':Object.freeze({label:'Rail Cannon',damage:90,pellets:1,range:40,spread:0,interval:.9,color:0xc66bff,rays:1,score:1.5}),
  ...EXTRA_WEAPONS,
});
