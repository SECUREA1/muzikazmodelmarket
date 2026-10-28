import test from 'node:test';
import assert from 'node:assert/strict';
import {residentSocialPrompt,residentCanTalk} from '../public/js/resident-social-prompt.js';
import {createResidentConversationAudio} from '../public/js/resident-conversation-audio.js';

function fixture(){
 const snapshot={serverTime:100000,players:{me:{position:{x:0,y:0,z:0}}},actors:{guide:{id:'guide',position:{x:2,y:0,z:0},resident:{name:'Robin',speech:'Would you like to explore?',speechUntil:104000}}}};
 snapshot.players.me.residentNearby={id:'guide',name:'Robin',ask:'Ask me about the local map',at:100000,expiresAt:108000};
 return snapshot;
}
test('nearby greetings expire and never invite through floors or across the map',()=>{
 const s=fixture();assert.equal(residentSocialPrompt(s,'me','commons').kind,'greeting');
 s.serverTime=108001;assert.equal(residentSocialPrompt(s,'me','commons'),null);
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
 assert.equal(residentSocialPrompt(s,'me','harbor'),null);
 self.residentInvitation.status='declined';assert.equal(residentSocialPrompt(s,'me','commons'),null);
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
