export function worldPopulation(state={},now=null){
 const humans=[],ai=new Map();
 for(const [id,p]of Object.entries(state.players||{})){
  if(p.replacedByRoom||now!==null&&Number.isFinite(p.lastSeen)&&now-p.lastSeen>=15000)continue;
  if(p.basketballAI||p.isAI)ai.set(id,{id,name:p.username||'Team player',role:'AI player'});else humans.push({id,name:p.username||'Player'});
 }
 for(const a of Object.values(state.actors||{}))if(a.active!==false&&(a.resident||a.trafficAI))ai.set(a.id,{id:a.id,name:a.resident?.name||a.crew?.name||a.name||'Local crew',role:a.resident?.role||'Transport crew'});
 for(const w of state.construction?.crew?.workers||[])ai.set(w.id,{id:w.id,name:w.name,role:w.role});
 for(const npc of Object.values(state.prison?.npcs||{}))ai.set(npc.id,{id:npc.id,name:npc.name,role:npc.role==='guard'?'Prison guard':'Prisoner'});
 return {humanCount:humans.length,aiCount:ai.size,humans,ai:[...ai.values()]};
}
