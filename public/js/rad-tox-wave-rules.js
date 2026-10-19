export const RAD_TOX_WAVE_MS=120000;
export const RAD_TOX_NORMAL_WAVES=4;
export const RAD_TOX_BOSS_WAVE=RAD_TOX_NORMAL_WAVES+1;
export const RAD_TOX_POPULATION_BATCHES=3;
// Every device plays the same complete population. Quality only changes visuals.
export const RAD_TOX_MAX_LIVE_ENEMIES=138;
export const RAD_TOX_MAX_LIVE_ENEMIES_MOBILE=RAD_TOX_MAX_LIVE_ENEMIES;
export const RAD_TOX_ENEMY_KINDS=Object.freeze(['toxic','ghost','snake','brain','boss']);

function normalPopulation(level,wave){
 const multiplier=wave===1?1:2;
 const base=level===2?12:Math.min(18,8+(level-1)*2);
 const requested=base*multiplier,ghost=Math.max(2,Math.floor(requested/2));
 const snake=(level===2?3:2+(level>=3?2:0))*multiplier;
 return {toxic:Math.max(2,requested-ghost),ghost,snake,brain:2,boss:0};
}
function withTotal(counts){return {...counts,total:RAD_TOX_ENEMY_KINDS.reduce((total,kind)=>total+(counts[kind]||0),0)};}
// Keep the existing three-rotation score budget, but place the full configured
// population before play begins instead of withholding enemies until a kill.
export function radToxWavePopulation(level,wave){
 level=Math.max(1,Math.trunc(Number(level)||1));wave=Math.max(1,Math.trunc(Number(wave)||1));
 if(wave>=RAD_TOX_BOSS_WAVE){
  const counts=withTotal({toxic:0,ghost:0,snake:0,brain:0,boss:1});
  return {version:2,batches:1,concurrent:{...counts},budget:{...counts}};
 }
 const budget=withTotal(Object.fromEntries(Object.entries(normalPopulation(level,wave)).map(([kind,count])=>[kind,count*RAD_TOX_POPULATION_BATCHES])));
 return {version:2,batches:RAD_TOX_POPULATION_BATCHES,concurrent:{...budget},budget};
}
