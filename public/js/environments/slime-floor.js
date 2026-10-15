// Animate the existing floor material: no overlay meshes, particles or physics work.
const vertexHeader = `
varying vec3 vSlimeWorldPosition;
varying vec3 vSlimeWorldNormal;
`;
const vertexPosition = `
vec4 slimePosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  slimePosition = instanceMatrix * slimePosition;
#endif
vSlimeWorldPosition = (modelMatrix * slimePosition).xyz;
vSlimeWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
`;
const fragmentHeader = `
uniform float slimeTime;
varying vec3 vSlimeWorldPosition;
varying vec3 vSlimeWorldNormal;
float slimeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;
const fragmentCoating = `
// Only upward-facing walkable surfaces receive slime, even in merged GLB meshes.
float slimeMask = smoothstep(0.55, 0.85, normalize(vSlimeWorldNormal).y);
vec2 slimeUV = vSlimeWorldPosition.xz * 0.8;
float slimeWave = sin(slimeUV.x * 3.0 + slimeTime * 0.85
  + sin(slimeUV.y * 2.4 - slimeTime * 0.65)) * 0.5 + 0.5;
float slimeVein = pow(1.0 - abs(slimeWave * 2.0 - 1.0), 3.0);
vec2 slimeCell = floor(slimeUV);
float slimeSeed = slimeHash(slimeCell);
vec2 slimeCenter = vec2(0.3 + slimeSeed * 0.4, 0.3 + slimeHash(slimeCell + 17.0) * 0.4);
float slimeDistance = length(fract(slimeUV) - slimeCenter);
float slimePhase = fract(slimeTime * 0.38 + slimeSeed);
float slimeRadius = 0.04 + slimePhase * 0.24;
float slimeRing = (1.0 - smoothstep(0.012, 0.045, abs(slimeDistance - slimeRadius)))
  * smoothstep(0.0, 0.15, slimePhase) * (1.0 - smoothstep(0.68, 1.0, slimePhase));
float slimeDome = (1.0 - smoothstep(0.0, slimeRadius, slimeDistance))
  * (1.0 - smoothstep(0.55, 0.75, slimePhase));
vec3 slimeRGB = 0.5 + 0.5 * cos(slimeTime * 0.22 + slimeUV.x * 0.45
  + slimeUV.y * 0.35 + vec3(0.0, 2.094, 4.189));
vec3 slimeColor = mix(vec3(0.025, 0.16, 0.008), slimeRGB, 0.4 + slimeWave * 0.35);
slimeColor += vec3(0.2, 0.7, 0.05) * slimeVein * 0.25;
slimeColor += slimeRGB * slimeRing * 0.65 + vec3(0.35, 0.5, 0.22) * slimeDome * 0.2;
diffuseColor.rgb = mix(diffuseColor.rgb, slimeColor, slimeMask * 0.9);
`;

export function createSlimeFloor(meshes) {
  const time = {value:0}, materials = new Map(), coated = [];
  for (const mesh of new Set(meshes)) {
    if (!mesh?.isMesh || !mesh.geometry || mesh.visible === false) continue;
    const original = mesh.material;
    const coat = source => {
      if (!source || source.visible === false || !(source.isMeshStandardMaterial || source.isMeshPhysicalMaterial || source.isMeshLambertMaterial || source.isMeshPhongMaterial)) return source;
      if (materials.has(source)) return materials.get(source);
      const material = source.clone(), previousCompile = source.onBeforeCompile;
      material.onBeforeCompile = function(shader, renderer) {
        previousCompile?.call(this, shader, renderer);
        shader.uniforms.slimeTime = time;
        shader.vertexShader = vertexHeader + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + vertexPosition);
        shader.fragmentShader = fragmentHeader + shader.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragmentCoating)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.19, slimeMask);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += slimeRGB * (0.06 + slimeRing * 0.2) * slimeMask;');
      };
      material.customProgramCacheKey = () => source.customProgramCacheKey() + ':rgb-slime-floor-v1';
      materials.set(source, material);return material;
    };
    const next = Array.isArray(original) ? original.map(coat) : coat(original);
    if (Array.isArray(original) ? next.some((value,index)=>value!==original[index]) : next!==original) {
      mesh.material = next;coated.push({mesh,original});
    }
  }
  let disposed = false;
  return {
    get meshCount(){return coated.length;},
    update(elapsed, reducedMotion=false){if(!disposed)time.value=reducedMotion?0:Math.max(0,Number(elapsed)||0);},
    dispose(){
      if(disposed)return;disposed=true;
      for(const {mesh,original} of coated)mesh.material=original;
      // Textures are borrowed from the original materials, never disposed here.
      for(const material of materials.values())material.dispose();
      materials.clear();coated.length=0;
    }
  };
}
