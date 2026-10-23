// Small, local shared routines. Progress requires both people to physically
// reach their own work positions; this never awards player currency or runs
// construction hydraulics, which remain under the machine scheduler.
export function stepCommunityLife(sim,cast,now,dt){
 for(const actor of cast){const r=actor.resident;if(r.casino)continue;r.needs||={energy:85,social:75};r.needs.energy=Math.max(0,Math.min(100,r.needs.energy+dt*(r.phase==='relaxing'?.8:-.04)));r.needs.social=Math.max(0,Math.min(100,r.needs.social+dt*(r.phase==='socialising'?.8:-.02)));}
 for(const actor of cast){
  const r=actor.resident;if(r.casino||r.sharedTask||now<(r.communityRetryAt||0))continue;
  const friend=cast.filter(other=>other!==actor&&!other.resident.casino&&!other.resident.sharedTask&&now>=(other.resident.communityRetryAt||0)&&Math.hypot(other.position.x-actor.position.x,other.position.z-actor.position.z)<12).sort((a,b)=>Math.hypot(a.position.x-actor.position.x,a.position.z-actor.position.z)-Math.hypot(b.position.x-actor.position.x,b.position.z-actor.position.z))[0];
  if(!friend)continue;
  const play=r.ageGroup==='child'||friend.resident.ageGroup==='child',task={id:actor.id+':'+now,leaderId:actor.id,partnerId:friend.id,title:play?'Practice passing and welcome players':r.role==='Ground crew'?'Check equipment together':r.role==='Site coordinator'?'Prepare the next crew handover':'Organise local supplies together',elapsed:0,goal:16,state:'approaching'};
  r.sharedTask={...task};friend.resident.sharedTask={...task,partnerId:actor.id};
 }
 for(const actor of cast){
  const r=actor.resident,task=r.sharedTask;if(!task)continue;
  const friend=cast.find(other=>other.id===task.partnerId);if(!friend){delete r.sharedTask;r.communityRetryAt=now+10000;continue;}
  // Each keeps a separate, already verified home position, so working
  // together never overlaps people or invents a route through a wall.
  if(r.intelligenceVersion){if(r.goal?.familyTaskId!==task.id)r.goal={kind:'social',target:{...r.home},reason:task.title,status:'planned',startedAt:now,familyTaskId:task.id};}else r.goal={...r.home};if(r.ageGroup==='child'){r.role='Junior player';r.prop='ball';}r.phase=r.ageGroup==='child'?'playing':'working';r.gesture=r.ageGroup==='child'?'play':'work';
  if(task.leaderId!==actor.id)continue;
  const other=friend.resident.sharedTask;if(!other||other.id!==task.id)continue;
  const ready=Math.hypot(actor.position.x-r.home.x,actor.position.z-r.home.z)<.55&&Math.hypot(friend.position.x-friend.resident.home.x,friend.position.z-friend.resident.home.z)<.55&&Math.hypot(actor.position.x-friend.position.x,actor.position.z-friend.position.z)<12;
  task.state=other.state=ready?'working':'approaching';if(ready&&now>=(r.pauseUntil||0)&&now>=(friend.resident.pauseUntil||0))task.elapsed+=dt;
  other.elapsed=task.elapsed;
  for(const [person,partner]of [[actor,friend],[friend,actor]])person.resident.task=task.title.toLowerCase()+' with '+partner.resident.name+' · '+Math.min(100,Math.floor(task.elapsed/task.goal*10)*10)+'%';
  if(task.elapsed<task.goal)continue;
  for(const [person,partner]of [[actor,friend],[friend,actor]]){const info=person.resident;info.completedCommunityTasks=(info.completedCommunityTasks||0)+1;info.relationships||=[];if(Array.isArray(info.relationships)){let relationship=info.relationships.find(item=>item.id===partner.id);if(!relationship){relationship={id:partner.id,affinity:0,lastAt:now};info.relationships.push(relationship);}relationship.affinity=Math.min(100,relationship.affinity+5);relationship.lastAt=now;}else info.relationships[partner.id]=Math.min(100,(info.relationships[partner.id]||0)+5);info.speech='Thanks, '+partner.resident.name+'! Let’s share a break before the next task.';info.speechUntil=now+6000;info.phase='socialising';info.gesture='wave';info.needs.social=Math.min(100,info.needs.social+8);info.communityRetryAt=now+30000;delete info.sharedTask;if(info.goal?.familyTaskId===task.id)info.goal=null;}
 }
}
