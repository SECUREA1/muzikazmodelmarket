// Consume visual/audio events once, even when HTTP replies arrive out of order.
export class RoomEffectEvents {
 constructor({maxAge=1000,maxEvents=12,maxSounds=3,maxSeen=512}={}){Object.assign(this,{maxAge,maxEvents,maxSounds,maxSeen});this.seen=new Map();}
 clear(){this.seen.clear();}
 consume(events,serverTime){
  const fresh=[];
  for(const event of events||[]){if(!event||!['fire','enemy-attack'].includes(event.action)||!event.id||!Number.isFinite(event.at)||!event.origin)continue;const key=event.actorId+':'+event.action+':'+event.id;if(this.seen.has(key))continue;this.seen.set(key,event.at);const age=serverTime-event.at;if(age< -250||age>this.maxAge)continue;fresh.push(event);}
  while(this.seen.size>this.maxSeen)this.seen.delete(this.seen.keys().next().value);
  const selected=fresh.sort((a,b)=>a.at-b.at).slice(-this.maxEvents),soundIds=new Set(selected.filter(event=>event.action==='fire').slice(-this.maxSounds));
  return selected.map(event=>({event,audible:soundIds.has(event)}));
 }
}
