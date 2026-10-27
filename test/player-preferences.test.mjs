import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlayerPreferences,PLAYER_DEFAULTS} from '../public/js/player-preferences.js';
test('player preferences bound gameplay controls and discard untrusted fields',()=>{
 const result=normalizePlayerPreferences({mouseSensitivity:20,touchSensitivity:-1,fov:120,effectsVolume:0,hudScale:10,reticleSize:0,reticleColor:'url(bad)',invertLook:'false',reducedMotion:true,scrollZoom:true,health:999,walkSpeed:500});
 assert.equal(result.mouseSensitivity,3);assert.equal(result.touchSensitivity,.25);assert.equal(result.fov,92);assert.equal(result.effectsVolume,0);assert.equal(result.hudScale,1.25);assert.equal(result.reticleSize,12);assert.equal(result.reticleColor,PLAYER_DEFAULTS.reticleColor);assert.equal(result.invertLook,false);assert.equal(result.reducedMotion,true);assert.equal(result.scrollZoom,true);assert.equal('health'in result,false);assert.equal('walkSpeed'in result,false);
 assert.deepEqual(normalizePlayerPreferences(null),PLAYER_DEFAULTS);assert.equal(normalizePlayerPreferences({mouseSensitivity:NaN}).mouseSensitivity,1);
 assert.equal(normalizePlayerPreferences({reticleColor:'#FF12AA'}).reticleColor,'#ff12aa');
});

test('audio preferences retain independent mute states and default spatial playback on',()=>{
 const keys=['masterMuted','introductionMuted','announcementsMuted','dialogueMuted','effectsMuted','mediaMuted'];
 const saved=normalizePlayerPreferences({...Object.fromEntries(keys.map(key=>[key,true])),spatialAudio:false,effectsVolume:42});
 for(const key of keys){assert.equal(saved[key],true);assert.equal(PLAYER_DEFAULTS[key],false);assert.equal(normalizePlayerPreferences({[key]:'true'})[key],false);}
 assert.equal(saved.spatialAudio,false);assert.equal(saved.effectsVolume,42);
 assert.equal(normalizePlayerPreferences({spatialAudio:'false'}).spatialAudio,true);
 assert.equal(normalizePlayerPreferences({effectsMuted:true,effectsVolume:82}).effectsVolume,82);
});

test('voice choices accept supported genders and bounded installed voice identifiers',()=>{
 for(const gender of ['auto','female','male'])assert.equal(normalizePlayerPreferences({speechVoiceGender:gender}).speechVoiceGender,gender);
 for(const gender of ['robot',null,{},true])assert.equal(normalizePlayerPreferences({speechVoiceGender:gender}).speechVoiceGender,'auto');
 const voiceURI='Microsoft Aria Online (Natural) - English (United States)';
 assert.equal(normalizePlayerPreferences({speechVoiceURI:voiceURI}).speechVoiceURI,voiceURI);
 assert.equal(normalizePlayerPreferences({speechVoiceURI:'v'.repeat(512)}).speechVoiceURI.length,512);
 for(const uri of ['v'.repeat(513),null,123,'voice\u0000secret','voice\nname'])assert.equal(normalizePlayerPreferences({speechVoiceURI:uri}).speechVoiceURI,'');
 assert.equal(PLAYER_DEFAULTS.speechVoiceGender,'auto');assert.equal(PLAYER_DEFAULTS.speechVoiceURI,'');
});
