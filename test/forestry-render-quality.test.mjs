import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {forestryRenderPreset,applyForestryRenderQuality} from '../public/js/forest-harvest-render-quality.js';
import {QUALITY_PRESETS} from '../public/js/environments/environment-quality.js';

test('forest detail increases hardware fidelity while preserving low-power settings and other maps',()=>{
 const forest={id:'forest-harvest'},ordinary={id:'public-commons'},base={...QUALITY_PRESETS.balanced};
 assert.equal(forestryRenderPreset(forest,base).shadowSize,2048);assert.equal(forestryRenderPreset(forest,base).pixelRatio,2);
 assert.deepEqual(base,QUALITY_PRESETS.balanced);
 assert.deepEqual(forestryRenderPreset(forest,QUALITY_PRESETS.performance),QUALITY_PRESETS.performance);
 assert.deepEqual(forestryRenderPreset(forest,base,{maxTextureSize:2048}),base);
 assert.deepEqual(forestryRenderPreset(ordinary,base),base);
 const sun=new T.DirectionalLight(),renderer={capabilities:{maxTextureSize:8192},shadowMap:{}};
 applyForestryRenderQuality(forest,sun,renderer,base);assert.equal(sun.shadow.camera.right,32);assert.equal(sun.shadow.mapSize.x,2048);assert.ok(sun.shadow.normalBias>0);
 applyForestryRenderQuality(ordinary,sun,renderer,base);assert.equal(sun.shadow.camera.right,45);assert.equal(sun.shadow.mapSize.x,1024);assert.equal(sun.shadow.normalBias,0);
});
