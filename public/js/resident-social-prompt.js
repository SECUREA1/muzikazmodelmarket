const point = value => value && [value.x, value.y ?? 0, value.z].every(Number.isFinite);
export const residentContactDistance = (a, b) => point(a) && point(b)
  ? Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z) : Infinity;
export const residentCanTalk = (a, b) => residentContactDistance(a, b) <= 10 && Math.abs((a?.y ?? 0) - (b?.y ?? 0)) < 1.2;

// Only server-offered, current-map social interactions become visitor prompts.
export function residentSocialPrompt(snapshot, selfId, worldId) {
  const self = snapshot?.players?.[selfId], now = snapshot?.serverTime;
  if (!self || !Number.isFinite(now)) return null;
  const visit = self.residentVisit;
  if (visit?.status === 'active' && visit.worldId === worldId && (!Number.isFinite(visit.deadline) || visit.deadline > now)) {
    const checkpoint = visit.checkpoints?.[visit.index ?? 0];
    if (!checkpoint) return null;
    const gap = residentContactDistance(self.position, checkpoint);
    return {kind:'visit',key:'visit:'+visit.id,entityId:visit.residentId,title:visit.title||'Visit together',
      message:(checkpoint.name||'Activity point')+' · '+(Number.isFinite(gap)?Math.round(gap)+' m away':'Follow the local map'),
      canConfirm:gap <= Number(checkpoint.radius||4) && Math.abs((self.position?.y??0)-(checkpoint.y??0))<1.2 && !self.vehicleId && self.grounded!==false && (!Number.isFinite(visit.startedAt)||now-visit.startedAt>=1200)};
  }
  const invitation = self.residentInvitation;
  if (invitation?.status === 'offered' && invitation.worldId === worldId && Number.isFinite(invitation.expiresAt) && invitation.expiresAt > now) {
    const actor = snapshot.actors?.[invitation.residentId];
    if (actor?.active === false || !actor?.resident || residentContactDistance(self.position,actor.position)>14 || Math.abs((self.position?.y??0)-(actor.position?.y??0))>=1.2) return null;
    return {kind:'invitation',key:'invitation:'+invitation.id,entityId:invitation.residentId,
      title:actor.resident.name+' invites you',message:invitation.title+(invitation.description?' · '+invitation.description:''),canTalk:residentCanTalk(self.position,actor.position)};
  }
  const nearby = self.residentNearby, actor = snapshot.actors?.[nearby?.id];
  if (!actor?.resident || actor.active === false || !residentCanTalk(self.position,actor.position)) return null;
  const expires = Number.isFinite(nearby.expiresAt) ? nearby.expiresAt : actor.resident.speechUntil;
  if (!Number.isFinite(expires) || expires <= now) return null;
  return {kind:'greeting',key:'greeting:'+nearby.id+':'+(nearby.at??expires),entityId:nearby.id,
    title:(nearby.name||actor.resident.name)+' would like to chat',message:nearby.ask||actor.resident.speech||'Ask about this map or find something to do together.',canTalk:true};
}
