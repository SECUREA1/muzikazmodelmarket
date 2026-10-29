// Shared, metre-based scene rallies. The server and solo scene use the same
// contact tests; a client can request a stroke, never a ball position or score.
export const PING_PONG=Object.freeze({radius:.032,reach:1.85,partnerReach:12,cooldownMs:280,swingWindowMs:360,gravity:5.2,missLifetimeMs:2000,onlineMs:15000});
const fail=message=>{throw Object.assign(new Error(message),{statusCode:409});};
const finite=value=>Number.isFinite(value)?value:0;
const idOf=player=>player.actorId||player.id;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const copy=point=>({x:finite(point?.x),y:finite(point?.y),z:finite(point?.z)});
const contact=player=>({...copy(player.position),y:finite(player.position?.y)+1.12});
const facing=(player,point)=>{const dx=point.x-player.position.x,dz=point.z-player.position.z,span=Math.hypot(dx,dz);return span<.45||(-Math.sin(finite(player.yaw))*dx-Math.cos(finite(player.yaw))*dz)/span>-.25;};
const active=(player,now)=>Boolean(player&&player.position&&(player.health===undefined||player.health>0)&&!player.replacedByRoom&&!player.vehicleId&&!player.seatedId&&!player.skiing&&!player.skiLift&&(player.lastSeen===undefined||now-player.lastSeen<PING_PONG.onlineMs));
const state=sim=>sim.pingPong ||= {sequence:0,balls:{},partners:{}};
const paddle=player=>player.pingPong ||= {equipped:false,equippedAt:0,swingAt:null,stroke:'forehand',sequence:0,partnerId:null,rally:0,bestRally:0,message:'Draw your paddle to play.'};
const visible=(context,from,to)=>!context.visible||context.visible(from,to);
const partnerPlayer=(sim,id)=>sim.players?.[id]||Object.values(sim.players||{}).find(player=>idOf(player)===id);
function participant(sim,id,now){
 const player=partnerPlayer(sim,id);if(player)return active(player,now)&&player.pingPong?.equipped?player:null;
 const partner=sim.pingPong?.partners[id];if(!partner)return null;
 if(partner.residentId){const actor=sim.actors?.[partner.residentId];if(!actor||actor.active===false||actor.health===0)return null;partner.position=copy(actor.position);partner.yaw=finite(actor.rotation?.y);}
 return partner;
}
function segmentDistance(point,from,to){
 const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,span=dx*dx+dy*dy+dz*dz;
 const t=span?Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy+(point.z-from.z)*dz)/span)):0;
 return distance(point,{x:from.x+dx*t,y:from.y+dy*t,z:from.z+dz*t});
}
function updateRally(sim,ball,message){
 for(const id of [ball.ownerId,ball.targetId,ball.lastHitId]){const player=partnerPlayer(sim,id);if(!player)continue;const p=paddle(player);p.rally=ball.rally;p.bestRally=Math.max(p.bestRally,ball.rally);if(message)p.message=message;}
}
function miss(sim,ball,now,message='Ball missed. Serve to start another rally.'){
 ball.status='missed';ball.missedAt=now;updateRally(sim,ball,message);
}
function launch(sim,ball,hitter,target,now,stroke='forehand'){
 const origin=contact(hitter),end=contact(target),span=distance(origin,end),duration=Math.max(.9,Math.min(1.75,span/4.6));
 ball.position=copy(origin);ball.previousPosition=copy(origin);ball.previousAt=now;
 ball.velocity={x:(end.x-origin.x)/duration,y:(end.y-origin.y)/duration+PING_PONG.gravity*duration/2,z:(end.z-origin.z)/duration};
 ball.targetId=idOf(target);ball.lastHitId=idOf(hitter);ball.hitAt=now;ball.arrivesAt=now+duration*1000;ball.status='flying';ball.floor=Math.min(hitter.position.y,target.position.y);ball.expiresAt=now+Math.max(2500,duration*1000+900);
 ball.rally++;ball.stroke=stroke;updateRally(sim,ball,'Rally '+ball.rally+' · meet the ball in front and swing.');
}
function selectPartner(sim,player,requested,now,context){
 const s=state(sim),ownId=idOf(player),p=paddle(player);
 const choose=partner=>{const next=idOf(partner);for(const [id,other]of Object.entries(s.partners))if(other.ownerId===ownId&&id!==next)delete s.partners[id];p.partnerId=next;return partner;};
 if(requested&&requested!=='ai'){
  const peer=partnerPlayer(sim,requested);
  if(peer){if(peer===player||!active(peer,now)||!peer.pingPong?.equipped)fail('Choose a nearby player with their paddle drawn.');if(distance(player.position,peer.position)>PING_PONG.partnerReach||!visible(context,contact(player),contact(peer)))fail('Move closer with a clear path to your partner.');return choose(peer);}
  const actor=sim.actors?.[requested];
  if(actor?.resident&&actor.active!==false&&actor.health!==0){
   if(distance(player.position,actor.position)>PING_PONG.partnerReach||!visible(context,contact(player),contact(actor)))fail('Move closer with a clear path to that AI resident.');
   const id='ping-pong-resident:'+ownId+':'+requested,partner=s.partners[id] ||= {id,actorId:id,ownerId:ownId,residentId:requested,username:actor.resident.name||actor.name||'AI rally partner',pingPong:{equipped:true,equippedAt:now,swingAt:null,stroke:'forehand',sequence:0}};
   partner.position=copy(actor.position);partner.yaw=finite(actor.rotation?.y);return choose(partner);
  }
  if(s.partners[requested]?.ownerId===ownId){const partner=participant(sim,requested,now);if(partner)return choose(partner);}
  fail('That ping-pong partner is unavailable.');
 }
 if(!requested){
  const prior=participant(sim,p.partnerId,now);if(prior&&distance(player.position,prior.position)<=PING_PONG.partnerReach&&visible(context,contact(player),contact(prior)))return choose(prior);
  const nearby=Object.values(sim.players||{}).filter(peer=>peer!==player&&active(peer,now)&&peer.pingPong?.equipped&&distance(player.position,peer.position)>=2.5&&distance(player.position,peer.position)<=PING_PONG.partnerReach&&visible(context,contact(player),contact(peer))).sort((a,b)=>distance(a.position,player.position)-distance(b.position,player.position))[0];
  if(nearby)return choose(nearby);
 }
 const id='ping-pong-ai:'+ownId;
 let position=null;
 for(const angle of [0,.4,-.4,.8,-.8]){
  const yaw=finite(player.yaw)+angle,candidate={x:player.position.x-Math.sin(yaw)*5,y:player.position.y,z:player.position.z-Math.cos(yaw)*5},ground=context.groundAt?context.groundAt(candidate):candidate;
  if(!ground||!Number.isFinite(ground.y)||Math.abs(ground.y-player.position.y)>1.5)continue;
  const next={...candidate,y:ground.y};if(!visible(context,contact(player),contact({position:next})))continue;position=next;break;
 }
 if(!position)fail('Find an open space in front of you for an AI rally partner.');
 const partner={id,actorId:id,ownerId:ownId,residentId:null,username:'Ping-pong practice partner',position,yaw:Math.atan2(position.x-player.position.x,position.z-player.position.z),pingPong:{equipped:true,equippedAt:now,swingAt:null,stroke:'forehand',sequence:0}};
 s.partners[id]=partner;return choose(partner);
}
export function cancelPingPong(sim,player,message='Paddle stowed. Draw it again to play.'){
 if(!player)return;const id=idOf(player),p=paddle(player);p.equipped=false;p.partnerId=null;p.message=message;
 const s=sim.pingPong;if(!s)return;
 for(const [key,ball]of Object.entries(s.balls))if([ball.ownerId,ball.targetId,ball.lastHitId].includes(id))delete s.balls[key];
 for(const [key,partner]of Object.entries(s.partners))if(partner.ownerId===id)delete s.partners[key];
}
export function pingPongCommand(sim,player,command,now,context={}){
 const operation=command.operation||'swing',p=paddle(player),s=state(sim),ownId=idOf(player);
 if(!ownId)fail('Join a scene before using your paddle.');
 if(operation==='stow'){cancelPingPong(sim,player);return {message:p.message};}
 if(!active(player,now)||player.heldId)fail('Stand on foot with your hands free to use the paddle.');
 if(operation==='equip'){
  if(!p.equipped){p.equipped=true;p.equippedAt=now;p.swingAt=null;p.sequence++;p.message='Paddle drawn from your waist. Serve or swing to play.';}
  return {message:p.message};
 }
 if(!p.equipped)fail('Draw your waist paddle before playing ping-pong.');
 if(operation==='partner'){
  if(Object.values(s.balls).some(ball=>ball.status==='flying'&&[ball.ownerId,ball.targetId,ball.lastHitId].includes(ownId)))fail('Finish this rally or stow before changing partners.');
  const partner=selectPartner(sim,player,command.targetId||'ai',now,context);p.message='Ready to rally with '+(partner.username||'your partner')+'.';return {message:p.message,partnerId:idOf(partner)};
 }
 if(!['serve','swing'].includes(operation))fail('Choose Draw, Stow, Serve or Swing.');
 if(!['forehand','backhand'].includes(command.stroke||'forehand'))fail('Choose a forehand or backhand stroke.');
 if(p.swingAt!==null&&now-p.swingAt<PING_PONG.cooldownMs)fail('Let the paddle finish its swing.');
 const stroke=command.stroke||'forehand';
 if(operation==='serve'){
  if(Object.values(s.balls).some(ball=>ball.status==='flying'&&[ball.ownerId,ball.targetId,ball.lastHitId].includes(ownId)))fail('Return the ball already in play, or stow to end this rally.');
  const partner=selectPartner(sim,player,command.targetId,now,context);
  if(Object.values(s.balls).some(ball=>ball.status==='flying'&&[ball.ownerId,ball.targetId,ball.lastHitId].includes(idOf(partner))))fail('That partner is already in a rally.');
  const ball={id:'ping-pong-ball:'+ownId,ownerId:ownId,radius:PING_PONG.radius,rally:0};
  launch(sim,ball,player,partner,now,stroke);s.balls[ball.id]=ball;
  p.swingAt=now;p.stroke=stroke;p.sequence++;p.lastReturnSequence=p.sequence;s.sequence++;return {message:'Served to '+(partner.username||'your partner')+'.',ballId:ball.id};
 }
 p.swingAt=now;p.stroke=stroke;p.sequence++;s.sequence++;
 const ball=Object.values(s.balls).filter(ball=>ball.status==='flying'&&ball.targetId===ownId&&ball.lastHitId!==ownId).sort((a,b)=>distance(a.position,contact(player))-distance(b.position,contact(player))).find(ball=>{
  if(!facing(player,ball.position)||!visible(context,contact(player),ball.position))return false;
  if(distance(ball.position,contact(player))<=PING_PONG.reach)return true;
  return now-(ball.previousAt||0)<=180&&ball.previousPosition&&segmentDistance(contact(player),ball.previousPosition,ball.position)<=PING_PONG.reach;
 });
 if(!ball){p.message='Swing · move into reach of the returning ball.';return {message:p.message,hit:false};}
 const target=participant(sim,ball.lastHitId,now);
 if(!target||distance(player.position,target.position)>PING_PONG.partnerReach||!visible(context,contact(player),contact(target))){miss(sim,ball,now,'Partner unavailable. Serve to start again.');return {message:p.message,hit:false};}
 launch(sim,ball,player,target,now,stroke);p.lastReturnSequence=p.sequence;p.partnerId=idOf(target);return {message:'Clean '+stroke+' return · rally '+ball.rally+'.',hit:true,ballId:ball.id,rally:ball.rally};
}
export function stepPingPong(sim,now,dt,context={}){
 const s=sim.pingPong;if(!s)return;
 for(const player of Object.values(sim.players||{}))if(player.pingPong?.equipped&&(!active(player,now)||player.heldId))cancelPingPong(sim,player,'Rally ended. Draw your paddle when ready.');
 for(const [id,partner]of Object.entries(s.partners)){
  const owner=partnerPlayer(sim,partner.ownerId);if(!owner?.pingPong?.equipped){delete s.partners[id];continue;}
  participant(sim,id,now);
  const actor=sim.actors?.[partner.residentId];
  if(actor?.resident&&Object.values(s.balls).some(ball=>ball.status==='flying'&&(ball.targetId===id||ball.lastHitId===id))){actor.resident.pauseUntil=Math.max(actor.resident.pauseUntil||0,now+500);actor.resident.moving=false;partner.yaw=Math.atan2(partner.position.x-owner.position.x,partner.position.z-owner.position.z);actor.rotation ||= {};actor.rotation.y=partner.yaw;}
 }
 const duration=Math.max(0,Math.min(.25,finite(dt)));
 for(const [id,ball]of Object.entries(s.balls)){
  if(ball.status==='missed'&&now-ball.missedAt>PING_PONG.missLifetimeMs){delete s.balls[id];continue;}
  const steps=Math.max(1,Math.ceil(duration/.025));
  for(let index=0;index<steps;index++){
   const step=duration/steps,at=now-duration*1000+(index+1)*step*1000;
   ball.previousPosition=copy(ball.position);ball.previousAt=at-step*1000;
   ball.position.x+=ball.velocity.x*step;ball.position.y+=ball.velocity.y*step-PING_PONG.gravity*step*step/2;ball.position.z+=ball.velocity.z*step;ball.velocity.y-=PING_PONG.gravity*step;
   if(ball.status==='flying'){
    const target=participant(sim,ball.targetId,now),owner=partnerPlayer(sim,ball.ownerId);
    if(!target||!owner?.pingPong?.equipped){miss(sim,ball,at,'Partner left the rally. Serve to play again.');continue;}
    if(!visible(context,ball.previousPosition,ball.position)){miss(sim,ball,at,'Ball hit an obstacle. Find a clear rally path.');ball.velocity.x*=-.25;ball.velocity.z*=-.25;continue;}
    // A requested stroke stays live while the visible paddle crosses its arc.
    // Swept contact catches the approaching ball between ticks, but each user
    // swing sequence can return only one ball and expires after 360 ms.
    const human=partnerPlayer(sim,ball.targetId),p=human?.pingPong;
    if(p&&p.swingAt!==null&&at>=p.swingAt&&at-p.swingAt<=PING_PONG.swingWindowMs&&p.lastReturnSequence!==p.sequence&&facing(human,ball.position)&&segmentDistance(contact(human),ball.previousPosition,ball.position)<=PING_PONG.reach&&visible(context,contact(human),ball.position)){
     const receiver=participant(sim,ball.lastHitId,now);
     if(receiver&&distance(human.position,receiver.position)<=PING_PONG.partnerReach&&visible(context,contact(human),contact(receiver))){
      launch(sim,ball,human,receiver,at,p.stroke);p.lastReturnSequence=p.sequence;p.partnerId=idOf(receiver);s.sequence++;continue;
     }
    }
    const partner=s.partners[ball.targetId];
    if(partner&&at>=ball.arrivesAt-170&&segmentDistance(contact(partner),ball.previousPosition,ball.position)<=PING_PONG.reach){
     const receiver=participant(sim,ball.lastHitId,now);
     if(receiver&&distance(partner.position,receiver.position)<=PING_PONG.partnerReach&&visible(context,contact(partner),contact(receiver))){
      const p=partner.pingPong;p.swingAt=at;p.stroke=ball.rally%2?'backhand':'forehand';p.sequence++;partner.yaw=Math.atan2(partner.position.x-receiver.position.x,partner.position.z-receiver.position.z);
      launch(sim,ball,partner,receiver,at,p.stroke);s.sequence++;continue;
     }
    }
    if(at>ball.expiresAt||ball.position.y<ball.floor+.05)miss(sim,ball,at);
   }
   if(ball.position.y<ball.floor+PING_PONG.radius){ball.position.y=ball.floor+PING_PONG.radius;ball.velocity.y=Math.abs(ball.velocity.y)*.45;ball.velocity.x*=.7;ball.velocity.z*=.7;}
  }
 }
}
export function pingPongView(sim){
 const s=sim.pingPong;if(!s)return {balls:[],partners:[],sequence:0};
 return {sequence:s.sequence,balls:Object.values(s.balls).map(ball=>({id:ball.id,ownerId:ball.ownerId,targetId:ball.targetId,lastHitId:ball.lastHitId,position:copy(ball.position),velocity:copy(ball.velocity),radius:ball.radius,rally:ball.rally,status:ball.status,hitAt:ball.hitAt,arrivesAt:ball.arrivesAt,floor:ball.floor})),partners:Object.values(s.partners).map(partner=>({...partner,position:copy(partner.position),pingPong:{...partner.pingPong}}))};
}
