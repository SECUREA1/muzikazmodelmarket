const point = value => value && [value.x, value.y ?? 0, value.z].every(Number.isFinite);
export const residentContactDistance = (a, b) => point(a) && point(b)
  ? Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z) : Infinity;
export const residentCanTalk = (a, b) => residentContactDistance(a, b) <= 10 && Math.abs((a?.y ?? 0) - (b?.y ?? 0)) < 1.2;
export const residentCanInteract = (position,actor) => !!actor?.resident && actor.active !== false
  && (actor.health ?? 100) > 0 && actor.resident.isAI !== false && actor.questRole !== 'hostile'
  && actor.definition?.gameplay?.behavior !== 'hostile' && residentCanTalk(position,actor.position);
export function nearestResidentActor(position,actors={},crew=null) {
  const workers=(crew?.workers||[]).map(worker=>({...worker,resident:{...worker.socialResident,name:worker.socialResident?.name||worker.name,role:worker.role}}));
  return [...Object.values(actors||{}),...workers].filter(actor=>residentCanInteract(position,actor))
    .sort((a,b)=>residentContactDistance(position,a.position)-residentContactDistance(position,b.position)||String(a.id).localeCompare(String(b.id)))[0]||null;
}

// Only server-offered, current-map social interactions become visitor prompts.
export function residentSocialPrompt(snapshot, selfId, worldId) {
  const self = snapshot?.players?.[selfId], now = snapshot?.serverTime;
  if (!self || self.health <= 0 || !Number.isFinite(now)) return null;
  const visit = self.residentVisit;
  if (visit?.status === 'active' && visit.worldId === worldId && (!Number.isFinite(visit.deadline) || visit.deadline > now)) {
    const checkpoint = visit.checkpoints?.[visit.index ?? 0];
    if (checkpoint) {
      const gap = residentContactDistance(self.position, checkpoint);
      return {kind:'visit',key:'visit:'+visit.id,entityId:visit.residentId,title:visit.title||'Visit together',
        message:(checkpoint.name||'Activity point')+' · '+(Number.isFinite(gap)?Math.round(gap)+' m away':'Follow the local map'),
        canConfirm:gap <= Number(checkpoint.radius||4) && Math.abs((self.position?.y??0)-(checkpoint.y??0))<1.2 && !self.vehicleId && self.grounded!==false && (!Number.isFinite(visit.startedAt)||now-visit.startedAt>=1200)};
    }
  }
  const invitation = self.residentInvitation;
  if (invitation?.status === 'offered' && invitation.worldId === worldId && Number.isFinite(invitation.expiresAt) && invitation.expiresAt > now) {
    const actor = snapshot.actors?.[invitation.residentId];
    if (actor?.active !== false && actor?.resident && (actor.health??100)>0 && residentContactDistance(self.position,actor.position)<=14 && Math.abs((self.position?.y??0)-(actor.position?.y??0))<1.2) return {kind:'invitation',key:'invitation:'+invitation.id,entityId:invitation.residentId,
      title:actor.resident.name+' invites you',message:invitation.title+(invitation.description?' · '+invitation.description:''),canTalk:residentCanTalk(self.position,actor.position)};
  }
  const nearby = self.residentNearby, actor = snapshot.actors?.[nearby?.id];
  if (residentCanInteract(self.position,actor)) {
    const expires = Number.isFinite(nearby?.expiresAt) ? nearby.expiresAt : actor.resident.speechUntil;
    if (Number.isFinite(expires) && expires > now) return {kind:'greeting',key:'greeting:'+nearby.id+':'+(nearby.at??expires),entityId:nearby.id,
      title:(nearby.name||actor.resident.name)+' would like to chat',message:nearby.ask||actor.resident.speech||'Ask about this map or find something to do together.',canTalk:true};
  }
  // Residents stay approachable while walking or working, even when their
  // greeting has ended. This affordance is not a new spoken announcement.
  const resident=nearestResidentActor(self.position,snapshot.actors,snapshot.construction?.crew);
  if (!resident) return null;
  const name=resident.resident.name||resident.name||'Resident';
  return {kind:'nearby',key:'nearby:'+worldId+':'+resident.id,entityId:resident.id,title:'Talk to '+name,
    message:'Ask about '+(resident.resident.placeName||'this place')+', their work or something to do together.',canTalk:true};
}
