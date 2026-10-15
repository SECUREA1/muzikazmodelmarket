export const PLAYER_DEFAULTS=Object.freeze({mouseSensitivity:1,touchSensitivity:1,invertLook:false,fov:68,effectsVolume:100,hudScale:1,reticleSize:20,reticleColor:'#caff49',reducedMotion:false,scrollZoom:false});
const ranges={mouseSensitivity:[.25,3],touchSensitivity:[.25,3],fov:[32,92],effectsVolume:[0,100],hudScale:[.85,1.25],reticleSize:[12,32]};
export function normalizePlayerPreferences(input={}){
 const source=input&&typeof input==='object'?input:{};const result={...PLAYER_DEFAULTS};
 for(const[key,[min,max]]of Object.entries(ranges)){const value=source[key];if(typeof value==='number'&&Number.isFinite(value))result[key]=Math.max(min,Math.min(max,value));}
 for(const key of ['invertLook','reducedMotion','scrollZoom'])if(typeof source[key]==='boolean')result[key]=source[key];
 if(typeof source.reticleColor==='string'&&/^#[0-9a-f]{6}$/i.test(source.reticleColor))result.reticleColor=source.reticleColor.toLowerCase();
 return result;
}
