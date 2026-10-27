import test from 'node:test';
import assert from 'node:assert/strict';
import {FUNHOUSE_AUDIO_DEFAULTS,normalizeFunhouseAudioSettings,funhouseAudioAllowed,funhouseAudioNotice} from '../public/js/funhouse-audio-settings.js';

test('the sound booth normalizes its three independent channel controls without accepting unrelated saved data',()=>{
 assert.deepEqual(normalizeFunhouseAudioSettings(),FUNHOUSE_AUDIO_DEFAULTS);
 assert.deepEqual(normalizeFunhouseAudioSettings({musicVolume:140,voiceVolume:-7,effectsVolume:42.6,voiceMuted:true,musicMuted:'true',effectsMuted:false,other:'ignore'}),{musicMuted:false,voiceMuted:true,effectsMuted:false,musicVolume:100,voiceVolume:0,effectsVolume:43});
 assert.equal(normalizeFunhouseAudioSettings({musicVolume:null}).musicVolume,35);
 assert.equal(normalizeFunhouseAudioSettings({voiceVolume:NaN}).voiceVolume,75);
});

test('local sound preferences cannot override global master, dialogue or effects mutes',()=>{
 for(const channel of ['voice','music','effects'])assert.equal(funhouseAudioAllowed(channel,{}, {masterMuted:true}),false);
 assert.equal(funhouseAudioAllowed('voice',{}, {dialogueMuted:true}),false);assert.equal(funhouseAudioAllowed('music',{}, {dialogueMuted:true}),true);
 assert.equal(funhouseAudioAllowed('voice',{}, {effectsMuted:true}),true);assert.equal(funhouseAudioAllowed('music',{}, {effectsMuted:true}),false);
 assert.equal(funhouseAudioAllowed('effects',{}, {effectsVolume:0}),false);assert.equal(funhouseAudioAllowed('music',{musicMuted:true}),false);
 assert.match(funhouseAudioNotice({masterMuted:true}),/Captions remain available/);
});
