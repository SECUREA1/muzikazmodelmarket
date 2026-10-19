import {sportsEnvironmentKind} from '../sports-worlds.js';
// A builder scene may extend an authored world without turning it into terrain.
export function builderBaseEnvironment(environment) {
  const base = environment.builderScene?.baseEnvironment;
  return base && (base.modelUrl || base.modelUrls?.length) ? base : null;
}

export function normalizedBaseTransform(value = {}) {
  value=value&&typeof value==='object'?value:{};
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  return {x:number(value.x,0,-1000,1000),y:number(value.y,0,-1000,1000),z:number(value.z,0,-1000,1000),rotation:number(value.rotation,0,-360,360),scale:number(value.scale,1,.1,4)};
}
// Court/ice rules use regulation world coordinates on every client and server.
export const builderBaseAlignment=environment=>['basketball','hockey'].includes(sportsEnvironmentKind(environment))?{}:environment?.builderScene?.baseTransform||{};
// Apply alignment after authored normalization; repeated edits never accumulate.
export function applyBuilderBaseTransform(root, value) {
  const transform=normalizedBaseTransform(value);
  root.userData.authoredBaseTransform ||= {position:root.position.clone(),quaternion:root.quaternion.clone(),scale:root.scale.clone()};
  const authored=root.userData.authoredBaseTransform;
  root.position.copy(authored.position);root.quaternion.copy(authored.quaternion);root.scale.copy(authored.scale);
  root.scale.multiplyScalar(transform.scale);root.rotateOnWorldAxis({x:0,y:1,z:0},transform.rotation*Math.PI/180);
  root.position.x+=transform.x;root.position.y+=transform.y;root.position.z+=transform.z;
  root.updateMatrixWorld(true);
  return transform;
}

export function builderBaseSpawn(environment) {
  const base=builderBaseEnvironment(environment)||environment.builderScene?.baseEnvironment;if(!base&&!environment.builderScene)return null;
  const point=(base||environment).spawn||{x:0,y:0,z:2},t=normalizedBaseTransform(builderBaseAlignment(environment)),angle=t.rotation*Math.PI/180;
  const x=(Number(point.x)||0)*t.scale,z=(Number(point.z)||0)*t.scale;
  return {x:x*Math.cos(angle)+z*Math.sin(angle)+t.x,y:(Number(point.y)||0)*t.scale+t.y,z:-x*Math.sin(angle)+z*Math.cos(angle)+t.z,rotationY:(Number(point.rotationY)||0)+angle};
}
