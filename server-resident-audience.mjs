const allowed = (value, viewerId) => !Array.isArray(value?.recipients) || value.recipients.includes(viewerId);
const callsFor = (value, viewerId) => Array.isArray(value) ? value.filter(call => allowed(call, viewerId)) : value;

// Apply this at the HTTP boundary rather than changing the persisted room or
// shared simulation. Recipient-only dialogue must not become public merely
// because another visitor requests a snapshot of the same map.
export function residentAudienceSnapshot(state, viewerId = null) {
  if (!state || typeof state !== 'object') return state;
  const radio = state.transportRadio || [];
  const privateSpeech = (info, speakerId) => {
    if (!info) return info;
    const isOtherPlayer = item => item.subjectId !== viewerId &&
      (state.players?.[item.subjectId] || /^(?:account:|solo:)/.test(item.subjectId || '') || item.kind === 'player-conversation');
    const memory = Array.isArray(info.memory) ? info.memory.filter(item => !isOtherPlayer(item)) : info.memory;
    // Deduplication IDs can embed an observation's text in older saves. They
    // are internal bookkeeping, not part of a resident's public experiences.
    if (memory !== info.memory || info.observedIds) info = {...info, memory, observedIds: []};
    let recipients = info.speechRecipients;
    // Existing saves predate explicit speech recipients. Direct reply captions
    // have the same text and speaker as their recipient-only radio record.
    if (!Array.isArray(recipients) && info.speech) {
      const call = [...radio].reverse().find(call => Array.isArray(call.recipients) &&
        call.speakerId === speakerId && call.text === info.speech &&
        Number.isFinite(call.at) && Number.isFinite(info.speechUntil) &&
        info.speechUntil >= call.at && info.speechUntil <= call.at + 15000);
      recipients = call?.recipients;
    }
    if (!Array.isArray(recipients) || recipients.includes(viewerId)) return info;
    return {...info, speech: '', speechUntil: 0, speaking: false, speechRecipients: []};
  };
  const players = Object.fromEntries(Object.entries(state.players || {}).map(([id, player]) => {
    const own = id === viewerId;
    const mission = player.vehicleMission;
    return [id, {...player,
      npcConversation: own && player.npcConversation ? {
        ...player.npcConversation, conversation: callsFor(player.npcConversation.conversation, viewerId)
      } : null,
      ...(mission ? {vehicleMission: {...mission, conversation: callsFor(mission.conversation, viewerId),
        ...(!own ? {aiWorkContext: null} : {})}} : {}),
      residentNearby: own ? player.residentNearby || null : null,
      residentInvitation: own ? player.residentInvitation || null : null,
      residentVisit: own ? player.residentVisit || null : null
    }];
  }));
  const actors = Object.fromEntries(Object.entries(state.actors || {}).map(([id, actor]) =>
    [id, actor.resident ? {...actor, resident: privateSpeech(actor.resident, id)} : actor]));
  let construction = state.construction;
  if (construction?.crew?.workers) construction = {...construction, crew: {...construction.crew,
    workers: construction.crew.workers.map(worker => ({...privateSpeech(worker, worker.id),
      ...(worker.socialResident ? {socialResident: privateSpeech(worker.socialResident, worker.id)} : {})}))
  }};
  return {...state, players, actors, transportRadio: callsFor(radio, viewerId),
    ...(construction ? {construction} : {})};
}
