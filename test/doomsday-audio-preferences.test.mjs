import test from 'node:test';
import assert from 'node:assert/strict';
import {enableDoomsdayAudioPreferences} from '../public/js/doomsday-audio-preferences.js';

test('explicit emergency audio recovery enables effects and announcements without changing unrelated preferences',()=>{
 const events=[],calls=[],scope={MUZIKAZ_AUDIO_SESSION_OVERRIDES:{introductionMuted:true},dispatchEvent:event=>events.push(event)};
 const current={masterMuted:true,effectsMuted:true,announcementsMuted:true,effectsVolume:34,dialogueMuted:true,mediaMuted:true,fov:83,speechVoiceGender:'female'};
 const voice={setPreferences:value=>calls.push(['preferences',value]),setMuted:value=>calls.push(['muted',value]),unlock:()=>{calls.push(['unlock']);return Promise.resolve(true);}};
 const value=enableDoomsdayAudioPreferences({getPreferences:()=>current,voice,scope});
 assert.equal(value.masterMuted,false);assert.equal(value.effectsMuted,false);assert.equal(value.announcementsMuted,false);assert.equal(value.effectsVolume,34);
 assert.equal(value.dialogueMuted,true);assert.equal(value.mediaMuted,true);assert.equal(value.fov,83);assert.equal(value.speechVoiceGender,'female');
 assert.equal(current.masterMuted,true,'the account settings object is not mutated');
 assert.deepEqual(scope.MUZIKAZ_AUDIO_SESSION_OVERRIDES,{introductionMuted:true,masterMuted:false,effectsMuted:false,announcementsMuted:false});
 assert.equal(scope.MUZIKAZ_AUDIO_PREFERENCES,value);assert.equal(events.length,1);assert.equal(events[0].type,'muzikaz:audio-preferences');assert.equal(events[0].detail,value);
 assert.deepEqual(calls.map(call=>call[0]),['preferences','muted','unlock'],'voice recovery starts synchronously inside the control gesture');
});

test('zero-volume recovery is retained across late preference restores and works without voice support',()=>{
 const scope={dispatchEvent(){}};
 const value=enableDoomsdayAudioPreferences({getPreferences:()=>({effectsVolume:0,effectsMuted:true,reticleSize:28}),scope});
 assert.equal(value.effectsVolume,100);assert.equal(scope.MUZIKAZ_AUDIO_SESSION_OVERRIDES.effectsVolume,100);
 const restored={masterMuted:true,effectsMuted:true,effectsVolume:0,...scope.MUZIKAZ_AUDIO_SESSION_OVERRIDES};
 assert.equal(restored.masterMuted,false);assert.equal(restored.effectsMuted,false);assert.equal(restored.effectsVolume,100);
 assert.equal(value.reticleSize,28);
});
