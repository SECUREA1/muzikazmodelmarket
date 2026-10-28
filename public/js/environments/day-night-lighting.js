import * as THREE from '../../vendor/three/three.module.min.js';
import {getDayNightState} from '../day-night-cycle.js';
import {outdoorProfile} from './outdoor-scenery.js';

// Reuse one directional shadow map for the sun by day and moon by night.
export function createDayNightLighting({scene, hemi, fill, sun, now = () => new Date(), onChange = () => {}}) {
  const baseline = {
    hemi: hemi.intensity, sky: hemi.color.clone(), ground: hemi.groundColor.clone(),
    fill: fill.intensity, fillColor: fill.color.clone(), sun: sun.intensity,
    sunColor: sun.color.clone(), sunPosition: sun.position.clone(), target: sun.target.position.clone()
  };
  const nightSky = new THREE.Color(0x526c9c), nightGround = new THREE.Color(0x101a2e);
  const warmSun = new THREE.Color(0xffb66c), moonColor = new THREE.Color(0xb8d5ff);
  const environmentMaterials = new Map();
  let profile = null, state, lastSample = null, materialSample = null;
  scene.add(sun.target);

  function restoreMaterials() {
    for (const [material, intensity] of environmentMaterials) material.envMapIntensity = intensity;
    environmentMaterials.clear();
  }
  function applyLighting(date, force = false) {
    // Re-read the OS clock after pauses, tab suspension, clock edits and timezone changes.
    const sample = Math.floor(date.getTime() / 1000) + ':' + date.getTimezoneOffset();
    if (!force && sample === lastSample) return;
    lastSample = sample;
    state = {...getDayNightState(date), outdoors: !!profile};
    scene.userData.dayNight = state;
    if (profile) {
      const cloudy = ['overcast', 'rain', 'storm'].includes(profile.weather);
      const weather = cloudy ? .58 : 1;
      const day = state.daylight;
      hemi.intensity = THREE.MathUtils.lerp(.28, baseline.hemi, day);
      hemi.color.copy(nightSky).lerp(baseline.sky, day);
      hemi.groundColor.copy(nightGround).lerp(baseline.ground, day);
      fill.intensity = THREE.MathUtils.lerp(.06, baseline.fill, day);
      fill.color.copy(moonColor).lerp(baseline.fillColor, day);
      const sunlight = baseline.sun * day * state.sunVisibility * weather;
      const moonlight = .65 * state.night * state.moonVisibility * weather;
      state.lightSource = sunlight >= moonlight ? 'sun' : 'moon';
      sun.intensity = Math.max(sunlight, moonlight);
      sun.color.copy(state.lightSource === 'moon' ? moonColor : warmSun);
      if (state.lightSource === 'sun') sun.color.lerp(baseline.sunColor, day);
      // Three r160 has no scene.environmentIntensity. Dim PBR reflections on
      // materials instead; include newly placed equipment on the next scan.
      const scan = Math.floor(date.getTime() / 5000);
      if (force || scan !== materialSample) {
        materialSample = scan;
        scene.traverse(object => {
          for (const material of [].concat(object.material || [])) {
            if (typeof material.envMapIntensity === 'number' && !environmentMaterials.has(material)) {
              environmentMaterials.set(material, material.envMapIntensity);
            }
          }
        });
      }
      for (const [material, intensity] of environmentMaterials) material.envMapIntensity = intensity * THREE.MathUtils.lerp(.12, 1, day);
    } else {
      hemi.intensity = baseline.hemi; hemi.color.copy(baseline.sky); hemi.groundColor.copy(baseline.ground);
      fill.intensity = baseline.fill; fill.color.copy(baseline.fillColor);
      sun.intensity = baseline.sun; sun.color.copy(baseline.sunColor);
      sun.position.copy(baseline.sunPosition); sun.target.position.copy(baseline.target);
      state.lightSource = 'indoor';
    }
    onChange(state, date);
  }
  function follow(anchor) {
    if (!profile || !anchor) return;
    const direction = state.lightSource === 'moon' ? state.moonDirection : state.sunDirection;
    // Keep shadows around the player, including while exploring distant maps.
    sun.target.position.set(anchor.x, anchor.y, anchor.z);
    sun.position.copy(sun.target.position).addScaledVector(direction, 60);
    sun.target.updateMatrixWorld();
  }
  return {
    get state() { return state; },
    setEnvironment(environment) {
      restoreMaterials(); materialSample = null;
      profile = outdoorProfile(environment);
      applyLighting(now(), true);
    },
    update(anchor) { applyLighting(now()); follow(anchor); return state; },
    dispose() { restoreMaterials(); sun.target.removeFromParent(); }
  };
}
