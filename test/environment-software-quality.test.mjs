import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = (await readFile(new URL('../public/js/environments/environment-quality.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');

function fixture({name = 'ANGLE (NVIDIA GeForce RTX)', masked = false, unavailable = false,
  blocked = false, cleanupThrows = false, mobile = false, threads = 8, textureSize = 8192, adapters = null} = {}) {
  const counts = {canvases: 0, contexts: [], released: 0, reads: 0};
  const gl = {
    RENDERER: 1,
    getExtension(extension) {
      if (extension === 'WEBGL_debug_renderer_info') return masked ? null : {UNMASKED_RENDERER_WEBGL: 2};
      if (extension === 'WEBGL_lose_context') return {loseContext() { counts.released++; if (cleanupThrows) throw Error('already lost'); }};
      return null;
    },
    getParameter(key) { counts.reads++; if (blocked) throw Error('masked context'); return key === 2 ? name : 'WebKit WebGL'; }
  };
  const canvas = {width: 300, height: 150, getContext(kind, options) {
    counts.contexts.push({kind, options});
    if (unavailable) return null;
    if (adapters) return {...gl, getParameter(key) { counts.reads++; return key === 2 ? adapters[options.powerPreference] : 'WebKit WebGL'; }};
    return gl;
  }};
  const renderer = {capabilities: {maxTextureSize: textureSize}, xr: {isPresenting: false}, getContext: () => gl};
  const context = vm.createContext({document: {createElement(kind) { assert.equal(kind, 'canvas'); counts.canvases++; return canvas; }},
    matchMedia: () => ({matches: mobile}), navigator: {userAgent: 'Desktop browser', hardwareConcurrency: threads},
    window: {devicePixelRatio: 1}, THREE: {}});
  vm.runInContext(source + '\n globalThis.api={QUALITY_PRESETS,chooseQualityPreset,softwareRendererRequiresPerformance};', context);
  return {api: context.api, counts, context, canvas, renderer, gl};
}

for (const name of ['ANGLE (Google, Vulkan (SwiftShader Device))', 'llvmpipe (LLVM 18)', 'softpipe', 'Mesa swrast', 'Microsoft Basic Render Driver', 'D3D11 WARP']) {
  test('automatic quality recognizes the software adapter: ' + name, () => {
    const f = fixture({name});
    assert.equal(f.api.softwareRendererRequiresPerformance(), true);
    assert.equal(f.api.chooseQualityPreset('auto', f.renderer), f.api.QUALITY_PRESETS.performance);
  });
}

test('software preflight is cached, uses the primary adapter preference and releases its tiny context', () => {
  const f = fixture({name: 'SwiftShader'});
  assert.equal(f.api.softwareRendererRequiresPerformance(), true);
  assert.equal(f.api.softwareRendererRequiresPerformance(), true);
  assert.equal(f.counts.canvases, 1);
  assert.equal(f.counts.contexts.length, 1);
  assert.equal(f.counts.contexts[0].kind, 'webgl2');
  assert.equal(f.counts.contexts[0].options.powerPreference, 'high-performance');
  assert.equal(f.counts.contexts[0].options.antialias, false);
  assert.equal(f.canvas.width, 1); assert.equal(f.canvas.height, 1);
  assert.equal(f.counts.released, 1);
});

test('dual-adapter preflights keep low-power and high-performance results separate', () => {
  for (const adapters of [
    {'high-performance': 'ANGLE (NVIDIA RTX)', 'low-power': 'SwiftShader'},
    {'high-performance': 'SwiftShader', 'low-power': 'ANGLE (Intel Iris)'}
  ]) {
    const f = fixture({adapters});
    const high = adapters['high-performance'] === 'SwiftShader';
    assert.equal(f.api.softwareRendererRequiresPerformance(), high);
    assert.equal(f.api.softwareRendererRequiresPerformance({powerPreference: 'low-power'}), !high);
    assert.equal(f.api.softwareRendererRequiresPerformance({powerPreference: 'high-performance'}), high);
    assert.equal(f.api.softwareRendererRequiresPerformance({powerPreference: 'low-power'}), !high);
    assert.equal(f.counts.canvases, 2);
    assert.equal(f.counts.contexts.length, 2);
    assert.equal(f.counts.contexts[0].options.powerPreference, 'high-performance');
    assert.equal(f.counts.contexts[1].options.powerPreference, 'low-power');
    assert.equal(f.counts.released, 2);
  }
});

test('real GPU auto defaults and explicit quality choices remain unchanged', () => {
  const hardware = fixture();
  assert.equal(hardware.api.softwareRendererRequiresPerformance(), false);
  assert.equal(hardware.api.chooseQualityPreset('auto', hardware.renderer), hardware.api.QUALITY_PRESETS.balanced);
  const software = fixture({name: 'SwiftShader'});
  for (const preset of ['high', 'balanced', 'performance']) {
    assert.equal(software.api.chooseQualityPreset(preset, software.renderer), software.api.QUALITY_PRESETS[preset]);
  }
  assert.equal(software.counts.canvases, 0);
  assert.equal(software.counts.reads, 0);
});

test('existing mobile, limited CPU/GPU and XR automatic fallbacks remain active', () => {
  for (const options of [{mobile: true}, {threads: 4}, {textureSize: 2048}]) {
    const f = fixture(options);
    assert.equal(f.api.chooseQualityPreset('auto', f.renderer), f.api.QUALITY_PRESETS.performance);
  }
  const f = fixture(); f.renderer.xr.isPresenting = true;
  assert.equal(f.api.chooseQualityPreset('auto', f.renderer), f.api.QUALITY_PRESETS.performance);
});

test('masked, blocked and unavailable WebGL safely retain the ordinary fallback', () => {
  for (const options of [{name: 'SwiftShader', masked: true}, {blocked: true}, {unavailable: true}]) {
    const f = fixture(options);
    assert.equal(f.api.softwareRendererRequiresPerformance(), false);
    assert.equal(f.api.softwareRendererRequiresPerformance(), false);
    assert.equal(f.counts.canvases, 1);
    assert.equal(f.counts.released, options.unavailable ? 0 : 1);
  }
  const f = fixture(); f.context.document.createElement = () => { throw Error('WebGL blocked'); };
  assert.equal(f.api.softwareRendererRequiresPerformance(), false);
});

test('a missing document or already-lost temporary context never breaks startup', () => {
  const f = fixture({name: 'SwiftShader', cleanupThrows: true});
  assert.equal(f.api.softwareRendererRequiresPerformance(), true);
  assert.equal(f.counts.released, 1);
  const noDocument = fixture(); delete noDocument.context.document;
  assert.equal(noDocument.api.softwareRendererRequiresPerformance(), false);
  noDocument.context.document = {createElement() { return noDocument.canvas; }};
  assert.equal(noDocument.api.softwareRendererRequiresPerformance(), false);
  assert.equal(noDocument.counts.released, 1);
});
