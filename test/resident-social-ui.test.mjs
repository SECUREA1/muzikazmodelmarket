import test from 'node:test';
import assert from 'node:assert/strict';
import {residentSocialPrompt,residentCanTalk,nearestResidentActor} from '../public/js/resident-social-prompt.js';
import {createResidentConversationAudio} from '../public/js/resident-conversation-audio.js';

function fixture(){
 const snapshot={serverTime:100000,players:{me:{position:{x:0,y:0,z:0}}},actors:{guide:{id:'guide',position:{x:2,y:0,z:0},resident:{name:'Robin',speech:'Would you like to explore?',speechUntil:104000}}}};
 snapshot.players.me.residentNearby={id:'guide',name:'Robin',ask:'Ask me about the local map',at:100000,expiresAt:108000};
 return snapshot;
}
test('greetings expire without removing the nearby Talk action or replaying their text',()=>{
 const s=fixture();assert.equal(residentSocialPrompt(s,'me','commons').kind,'greeting');
 s.serverTime=108001;const quiet=residentSocialPrompt(s,'me','commons');assert.equal(quiet.kind,'nearby');assert.equal(quiet.entityId,'guide');assert.ok(!quiet.message.includes('Would you like to explore?'));
 s.serverTime=100000;s.actors.guide.position.y=3;assert.equal(residentSocialPrompt(s,'me','commons'),null);
 assert.equal(residentCanTalk(s.players.me.position,s.actors.guide.position),false);
 s.actors.guide.position={x:20,y:0,z:0};assert.equal(residentSocialPrompt(s,'me','commons'),null);
 s.actors.guide.position={x:2,y:0,z:0};s.actors.guide.active=false;assert.equal(residentSocialPrompt(s,'me','commons'),null);
});
test('server activity offers show only in their map and active visits guide a safe arrival',()=>{
 const s=fixture(),self=s.players.me;
 delete self.residentNearby;
 self.residentInvitation={id:'offer',worldId:'commons',residentId:'guide',title:'Inspect the garden',description:'Meet the gardening crew',status:'offered',expiresAt:120000};
 assert.equal(residentSocialPrompt(s,'me','commons').kind,'invitation');
 assert.equal(residentSocialPrompt(s,'me','harbor').kind,'nearby');
 self.residentInvitation.status='declined';assert.equal(residentSocialPrompt(s,'me','commons').kind,'nearby');
 self.residentVisit={id:'visit',residentId:'guide',worldId:'commons',title:'Garden visit',status:'active',deadline:130000,index:0,checkpoints:[{name:'Garden path',x:1,y:0,z:0,radius:4}]};
 assert.equal(residentSocialPrompt(s,'me','commons').canConfirm,true);
 self.residentVisit.startedAt=100000;assert.equal(residentSocialPrompt(s,'me','commons').canConfirm,false);
 self.residentVisit.startedAt=98000;self.vehicleId='boat';assert.equal(residentSocialPrompt(s,'me','commons').canConfirm,false);
 delete self.vehicleId;self.grounded=false;assert.equal(residentSocialPrompt(s,'me','commons').canConfirm,false);
 self.grounded=true;assert.equal(residentSocialPrompt(s,'me','commons').canConfirm,true);
 self.position.y=3;assert.equal(residentSocialPrompt(s,'me','commons').canConfirm,false);
 self.position={x:80,y:0,z:0};assert.equal(residentSocialPrompt(s,'me','commons').kind,'visit');
 assert.equal(residentSocialPrompt(s,'me','commons').canConfirm,false);
 s.serverTime=130001;assert.equal(residentSocialPrompt(s,'me','commons'),null);
});
test('quiet working residents expose the nearest same-floor interaction without a greeting',()=>{
 const s=fixture();delete s.players.me.residentNearby;
 Object.assign(s.actors.guide.resident,{speech:'',speechUntil:0,moving:true,machineWork:{status:'active',message:'Operating the press'}});
 s.actors.closer={id:'closer',position:{x:1,y:0,z:0},resident:{name:'Maya'}};
 s.actors.upstairs={id:'upstairs',position:{x:0,y:3,z:0},resident:{name:'Upstairs'}};
 s.actors.inactive={id:'inactive',active:false,position:{x:0,y:0,z:0},resident:{name:'Inactive'}};
 s.actors.defeated={id:'defeated',health:0,position:{x:0,y:0,z:0},resident:{name:'Defeated'}};
 assert.equal(nearestResidentActor(s.players.me.position,s.actors).id,'closer');
 assert.equal(residentSocialPrompt(s,'me','commons').entityId,'closer');
 s.actors.closer.position.x=30;
 assert.equal(residentSocialPrompt(s,'me','commons').entityId,'guide');
 assert.equal(s.actors.guide.resident.machineWork.status,'active');
 s.players.me.position.x=25;assert.equal(residentSocialPrompt(s,'me','commons').entityId,'closer');
 s.players.me.position.x=50;assert.equal(residentSocialPrompt(s,'me','commons'),null);
 s.players.me.position.x=0;s.players.me.health=0;assert.equal(residentSocialPrompt(s,'me','commons'),null);
});
test('nearby construction crew stay approachable before their first conversation',()=>{
 const s=fixture();s.actors={};delete s.players.me.residentNearby;
 s.construction={crew:{workers:[{id:'operator',name:'Maya',role:'Machine operator',position:{x:3,y:0,z:0},enabled:true,jobId:'digging',message:'Excavating the site'}]}};
 const prompt=residentSocialPrompt(s,'me','construction');assert.equal(prompt.kind,'nearby');assert.equal(prompt.entityId,'operator');assert.match(prompt.title,/Maya/);
 assert.equal(s.construction.crew.workers[0].jobId,'digging');
 s.construction.crew.workers[0].position.y=3;assert.equal(residentSocialPrompt(s,'me','construction'),null);
});
test('walk-up greetings speak once only to their addressed visitor and respect audio priority',()=>{
 for(const condition of ['addressed','other-player','floor','muted','private-reply']){
  const s=fixture(),calls=[],voice={state:{unlocked:true,audioReady:true},announce:(text,options)=>calls.push({text,...options})};
  delete s.actors.guide.resident.speech;delete s.actors.guide.resident.speechUntil;
  const audio=createResidentConversationAudio({voice});audio.update(s,'me',{id:'commons'});
  Object.assign(s.actors.guide.resident,{speech:'Would you like to explore?',speechUntil:104000,speaking:true,interaction:{kind:'visitor-greeting',phase:'speaking',playerId:condition==='other-player'?'other':'me'}});
  if(condition==='floor')s.actors.guide.position.y=3;
  if(condition==='muted')voice.state.muted=true;
  if(condition==='private-reply')s.players.me.npcConversation={conversation:[{speakerId:'guide',text:'Would you like to explore?',at:100000}]};
  audio.update(s,'me',{id:'commons'});audio.update(s,'me',{id:'commons'});
  assert.equal(calls.length,condition==='addressed'?1:0,condition);
 }
});
