const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
export class CameraSignaling {
 constructor(){this.feeds=new Map();this.queues=new Map();}
 prune(members,now){for(const [id,feed]of this.feeds)if(now-feed.updatedAt>15000||members.get(id)?.roomId!==feed.roomId){this.feeds.delete(id);}for(const [id,queue]of this.queues){const next=queue.filter(item=>now-item.sentAt<15000&&this.feeds.has(item.source));if(next.length)this.queues.set(id,next);else this.queues.delete(id);}}
 poll(member,members,now=Date.now()){
  this.prune(members,now);const feeds=[...this.feeds.values()].filter(feed=>feed.roomId===member.roomId).map(({source,deviceId,roomId})=>({source,deviceId,roomId}));
  const signals=(this.queues.get(member.sessionId)||[]).filter(item=>item.roomId===member.roomId);this.queues.delete(member.sessionId);return {feeds,signals};
 }
 command(member,members,body,{screen,player,now=Date.now()}={}){
  this.prune(members,now);const id=member.sessionId,operation=body.operation;
  if(operation==='stop'){this.feeds.delete(id);return {ok:true};}
  if(operation==='start'){
   if(typeof body.deviceId!=='string'||body.deviceId.length>200||!screen?.position||!screen||screen.kind!=='video'||screen.active===false||screen.holderId||!player?.position||player.replacedByRoom||!Number.isFinite(player.lastSeen)||now-player.lastSeen>15000||Math.hypot(screen.position.x-player.position.x,screen.position.y-player.position.y,screen.position.z-player.position.z)>5)fail('Move within reach of a video screen before sharing your camera.');
   if([...this.feeds.values()].some(feed=>feed.source!==id&&feed.roomId===member.roomId&&feed.deviceId===body.deviceId))fail('Someone is already broadcasting to this screen.');
   this.feeds.set(id,{source:id,roomId:member.roomId,deviceId:body.deviceId,updatedAt:now,viewers:new Set()});return {ok:true};
  }
  if(operation==='heartbeat'){const feed=this.feeds.get(id);if(!feed)fail('Camera session expired. Start sharing again.');feed.updatedAt=now;return {ok:true};}
  const source=String(body.source||''),feed=this.feeds.get(source),to=String(body.to||'');
  if(!feed||feed.roomId!==member.roomId||!members.get(to)||members.get(to).roomId!==member.roomId||to===id)fail('Camera peers must be in the same active space.',403);
  if(operation==='watch'){if(to!==source||id===source)fail('Invalid camera viewer.',403);feed.viewers.add(id);}
  else if(!['offer','answer','candidate'].includes(operation)||!feed.viewers.has(id===source?to:id)||(id!==source&&to!==source))fail('Join the screen before exchanging camera signals.',403);
  if(JSON.stringify(body.payload||null).length>48000)fail('Camera signal is too large.',400);
  const queue=this.queues.get(to)||[];queue.push({source,from:id,to,operation,payload:body.payload||null,deviceId:feed.deviceId,roomId:feed.roomId,sentAt:now});this.queues.set(to,queue.slice(-200));return {ok:true};
 }
}
