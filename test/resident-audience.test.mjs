import test from 'node:test';
import assert from 'node:assert/strict';
import {residentAudienceSnapshot} from '../server-resident-audience.mjs';

function fixture() {
  const human = {id:1,at:1000,speakerId:'account:alice',text:'A private player detail',recipients:['account:alice'],conversation:true};
  const reply = {id:2,at:1000,speakerId:'host',text:'I remember your private detail.',recipients:['account:alice'],conversation:true};
  const publicCall = {id:3,at:1500,speakerId:'host',text:'The garden opens at dawn.'};
  const npcLine = {speakerId:'host',text:'I practised a new rhythm.',at:2000};
  return {serverTime:2000,players:{
    'account:alice':{position:{x:1,y:0,z:0},npcConversation:{instanceId:'private',conversation:[human,reply]},residentNearby:{id:'host'},residentInvitation:{id:'walk'},residentVisit:{status:'active'},vehicleMission:{status:'active',title:'Public route',conversation:[human,reply],aiWorkContext:{lastQuestion:human.text}}},
    'account:bob':{position:{x:2,y:0,z:0}}
  },actors:{host:{id:'host',resident:{speech:reply.text,speechUntil:8000,speaking:true,speechRecipients:['account:alice'],memory:[
    {kind:'player-conversation',subjectId:'account:alice',text:'Private player observation'},
    {kind:'practice',subjectId:'music',text:'I practised a new rhythm.'},
    {kind:'conversation',subjectId:'friend',text:'Compared garden notes with a friend.'}
  ],observedIds:[{id:'Private internal deduplication text',at:1000}]}},friend:{id:'friend',resident:{speech:npcLine.text,speechUntil:5000,speaking:true}}},
  residentLife:{conversations:[{participants:['host','friend'],lines:[npcLine]}]},
  transportRadio:[human,reply,publicCall],construction:{crew:{workers:[{id:'host',speech:reply.text,speechUntil:8000,speechRecipients:['account:alice'],socialResident:{speech:reply.text,speechUntil:8000,speechRecipients:['account:alice']}}]}}};
}

test('the addressed player keeps direct dialogue, local invitations and their own relationship memory',()=>{
  const state=fixture(),view=residentAudienceSnapshot(state,'account:alice');
  assert.equal(view.players['account:alice'].npcConversation.conversation.length,2);
  assert.equal(view.players['account:alice'].residentInvitation.id,'walk');
  assert.equal(view.players['account:alice'].residentVisit.status,'active');
  assert.equal(view.transportRadio.length,3);
  assert.match(view.actors.host.resident.speech,/private detail/);
  assert.equal(view.actors.host.resident.memory.length,3);
});

test('other visitors and anonymous snapshots keep public NPC exchanges without receiving private player dialogue',()=>{
  const state=fixture(),before=structuredClone(state);
  for(const viewer of [null,'account:bob']){
    const view=residentAudienceSnapshot(state,viewer),alice=view.players['account:alice'];
    assert.equal(alice.npcConversation,null);assert.equal(alice.residentNearby,null);
    assert.equal(alice.residentInvitation,null);assert.equal(alice.residentVisit,null);
    assert.deepEqual(view.transportRadio.map(call=>call.id),[3]);
    assert.equal(view.actors.host.resident.speech,'');assert.equal(view.actors.host.resident.speaking,false);
    assert.equal(view.construction.crew.workers[0].speech,'');assert.equal(view.construction.crew.workers[0].socialResident.speech,'');
    assert.equal(alice.vehicleMission.title,'Public route');assert.deepEqual(alice.vehicleMission.conversation,[]);
    assert.equal(view.actors.friend.resident.speech,'I practised a new rhythm.');
    assert.equal(view.residentLife.conversations[0].lines[0].text,'I practised a new rhythm.');
    assert.equal(view.actors.host.resident.memory.length,2);
    assert.doesNotMatch(JSON.stringify(view),/private player detail|private detail|Private player observation|Private internal deduplication text/i);
  }
  assert.deepEqual(state,before,'audience projection must never alter canonical saved simulation state');
});

test('saved direct speech without recipient metadata is masked using its matching private radio record',()=>{
  const state=fixture();delete state.actors.host.resident.speechRecipients;
  assert.equal(residentAudienceSnapshot(state,'account:bob').actors.host.resident.speech,'');
  assert.match(residentAudienceSnapshot(state,'account:alice').actors.host.resident.speech,/private detail/);
  state.actors.host.resident.speech='The garden opens at dawn.';
  assert.equal(residentAudienceSnapshot(state).actors.host.resident.speech,'The garden opens at dawn.');
});

test('explicit team radio recipients retain only the addressed member while public dispatch stays visible',()=>{
  const state={transportRadio:[{id:1,text:'Team plan',recipients:['a','b']},{id:2,text:'Public dispatch'},{id:3,text:'No audience',recipients:[]}],players:{},actors:{}};
  assert.deepEqual(residentAudienceSnapshot(state,'a').transportRadio.map(call=>call.id),[1,2]);
  assert.deepEqual(residentAudienceSnapshot(state,'outsider').transportRadio.map(call=>call.id),[2]);
});
