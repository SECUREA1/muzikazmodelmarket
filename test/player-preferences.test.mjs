import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlayerPreferences,PLAYER_DEFAULTS} from '../public/js/player-preferences.js';
test('player preferences bound gameplay controls and discard untrusted fields',()=>{
 const result=normalizePlayerPreferences({mouseSensitivity:20,touchSensitivity:-1,fov:120,effectsVolume:0,hudScale:10,reticleSize:0,reticleColor:'url(bad)',invertLook:'false',reducedMotion:true,scrollZoom:true,health:999,walkSpeed:500});
 assert.equal(result.mouseSensitivity,3);assert.equal(result.touchSensitivity,.25);assert.equal(result.fov,92);assert.equal(result.effectsVolume,0);assert.equal(result.hudScale,1.25);assert.equal(result.reticleSize,12);assert.equal(result.reticleColor,PLAYER_DEFAULTS.reticleColor);assert.equal(result.invertLook,false);assert.equal(result.reducedMotion,true);assert.equal(result.scrollZoom,true);assert.equal('health'in result,false);assert.equal('walkSpeed'in result,false);
 assert.deepEqual(normalizePlayerPreferences(null),PLAYER_DEFAULTS);assert.equal(normalizePlayerPreferences({mouseSensitivity:NaN}).mouseSensitivity,1);
 assert.equal(normalizePlayerPreferences({reticleColor:'#FF12AA'}).reticleColor,'#ff12aa');
 for(const visualQuality of ['auto','performance','balanced','high'])assert.equal(normalizePlayerPreferences({visualQuality}).visualQuality,visualQuality);
 assert.equal(normalizePlayerPreferences({visualQuality:'hide-enemies'}).visualQuality,'auto');
});
