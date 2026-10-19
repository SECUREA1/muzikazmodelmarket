export const RAD_TOX_WAVE_MS=120000;
export const RAD_TOX_NORMAL_WAVES=4;
export const RAD_TOX_BOSS_WAVE=RAD_TOX_NORMAL_WAVES+1;
export const RAD_TOX_POPULATION_BATCHES=3;
export const RAD_TOX_MAX_LIVE_ENEMIES=24;
export const RAD_TOX_MAX_LIVE_ENEMIES_MOBILE=14;
export const RAD_TOX_ENEMY_KINDS=Object.freeze(['toxic','ghost','snake','brain','boss']);

function normalPopulation(level,wave,mobile=false){
 const multiplier=wave===1?1:2;
 const base=level===2?(mobile?8:12):Math.min(18,8+(level-1)*2);
 const requested=base*multiplier,ghost=Math.max(2,Math.floor(requested/2));
 const snake=(level===2?(mobile?2:3):(mobile?1:2)+(level>=3?(mobile?1:2):0))*multiplier;
 return {toxic:Math.max(2,requested-ghost),ghost,snake,brain:2,boss:0};
}
function withTotal(counts){return {...counts,total:RAD_TOX_ENEMY_KINDS.reduce((total,kind)=>total+(counts[kind]||0),0)};}
function limitConcurrent(counts,maximum){
 const total=withTotal(counts).total;if(total<=maximum)return withTotal(counts);
 const kinds=RAD_TOX_ENEMY_KINDS.filter(kind=>counts[kind]>0),quotas=Object.fromEntries(kinds.map(kind=>[kind,counts[kind]*maximum/total]));
 const limited=Object.fromEntries(RAD_TOX_ENEMY_KINDS.map(kind=>[kind,counts[kind]?Math.max(1,Math.floor(quotas[kind])):0]));
 let assigned=withTotal(limited).total;
 while(assigned<maximum){const kind=kinds.filter(kind=>limited[kind]<counts[kind]).sort((a,b)=>(quotas[b]-limited[b])-(quotas[a]-limited[a]))[0];limited[kind]++;assigned++;}
 while(assigned>maximum){const kind=kinds.filter(kind=>limited[kind]>1).sort((a,b)=>(limited[b]-quotas[b])-(limited[a]-quotas[a]))[0];limited[kind]--;assigned--;}
 return withTotal(limited);
}

// Three rotations of the authored enemy mix keep a two-minute wave populated.
// Only the concurrent group is rendered at once. The score budget is identical
// on mobile and desktop even when mobile uses fewer simultaneous enemies.
export function radToxWavePopulation(level,wave,{mobile=false}={}){
 level=Math.max(1,Math.trunc(Number(level)||1));wave=Math.max(1,Math.trunc(Number(wave)||1));
 if(wave>=RAD_TOX_BOSS_WAVE){
  const counts=withTotal({toxic:0,ghost:0,snake:0,brain:0,boss:1});
  return {version:1,batches:1,concurrent:{...counts},budget:{...counts}};
 }
 const concurrent=limitConcurrent(normalPopulation(level,wave,mobile),mobile?RAD_TOX_MAX_LIVE_ENEMIES_MOBILE:RAD_TOX_MAX_LIVE_ENEMIES);
 const budget=withTotal(Object.fromEntries(Object.entries(normalPopulation(level,wave)).map(([kind,count])=>[kind,count*RAD_TOX_POPULATION_BATCHES])));
 return {version:1,batches:RAD_TOX_POPULATION_BATCHES,concurrent,budget};
}
