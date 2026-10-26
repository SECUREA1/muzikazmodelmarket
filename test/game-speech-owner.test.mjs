import test from 'node:test';
import assert from 'node:assert/strict';
import {claimGameSpeech,releaseGameSpeech,cancelGameSpeech,isGameSpeechActive} from '../public/js/game-speech-owner.js';

test('one controller keeps its speech ownership without cancelling its own next line',()=>{
 const events=[],speech={speak(){},cancel(){events.push('cancel');}},owner=Symbol('npc');
 assert.equal(isGameSpeechActive(speech),false);
 claimGameSpeech(speech,owner,()=>events.push('interrupted'));
 assert.equal(isGameSpeechActive(speech),true);
 claimGameSpeech(speech,owner,()=>events.push('interrupted again'));
 assert.deepEqual(events,[]);
 releaseGameSpeech(speech,owner);
 assert.equal(isGameSpeechActive(speech),false);
 assert.deepEqual(events,[],'normal completion releases ownership without cancelling native speech');
});

test('handoff invalidates the old controller before native cancel and grants only the new owner control',()=>{
 const events=[],speech={speak(){},cancel(){events.push('native cancel');}},npc=Symbol('npc'),tower=Symbol('tower');
 claimGameSpeech(speech,npc,()=>{
  events.push('npc interrupted');
  assert.equal(isGameSpeechActive(speech),false,'ownership is removed before the old callback runs');
  assert.equal(cancelGameSpeech(speech,npc),false,'the interrupted controller cannot issue a second global cancel');
 });
 claimGameSpeech(speech,tower,()=>events.push('tower interrupted'));
 assert.deepEqual(events,['npc interrupted','native cancel']);
 assert.equal(isGameSpeechActive(speech),true);
 assert.equal(cancelGameSpeech(speech,npc),false);
 releaseGameSpeech(speech,npc);
 assert.equal(isGameSpeechActive(speech),true,'late completion from the previous voice cannot release the active one');
 assert.deepEqual(events,['npc interrupted','native cancel']);
 assert.equal(cancelGameSpeech(speech,tower),true);
 assert.equal(isGameSpeechActive(speech),false);
 assert.deepEqual(events,['npc interrupted','native cancel','native cancel']);
 assert.equal(cancelGameSpeech(speech,tower),false,'repeat cleanup is harmless');
});

test('idle radio reset or mute cannot cancel speech owned by another controller',()=>{
 let cancels=0;
 const speech={speak(){},cancel(){cancels++;}},narrator=Symbol('narrator'),idleTower=Symbol('tower');
 claimGameSpeech(speech,narrator,()=>{});
 assert.equal(cancelGameSpeech(speech,idleTower),false);
 releaseGameSpeech(speech,idleTower);
 assert.equal(cancels,0);
 assert.equal(isGameSpeechActive(speech),true);
 releaseGameSpeech(speech,narrator);
 assert.equal(isGameSpeechActive(speech),false);
});

test('ownership remains isolated between browser speech engines',()=>{
 const owner=Symbol('shared controller');let firstCancels=0,secondCancels=0;
 const first={speak(){},cancel(){firstCancels++;}},second={speak(){},cancel(){secondCancels++;}};
 claimGameSpeech(first,owner,()=>{});claimGameSpeech(second,owner,()=>{});
 assert.equal(cancelGameSpeech(first,owner),true);
 assert.equal(isGameSpeechActive(first),false);assert.equal(isGameSpeechActive(second),true);
 assert.equal(firstCancels,1);assert.equal(secondCancels,0);
 releaseGameSpeech(second,owner);
});

test('missing speech support keeps ownership cleanup safe',()=>{
 for(const speech of [null,undefined]){
  assert.equal(isGameSpeechActive(speech),false);
  assert.doesNotThrow(()=>claimGameSpeech(speech,Symbol('unsupported'),()=>{}));
  assert.doesNotThrow(()=>releaseGameSpeech(speech,Symbol('unsupported')));
  assert.equal(cancelGameSpeech(speech,Symbol('unsupported')),false);
 }
});
