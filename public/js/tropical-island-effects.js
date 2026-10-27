import * as T from '../vendor/three/three.module.min.js';

/** Visual-only presentation of the server's drink state. Shared input and
 * tracked headset poses are never changed by this effect. */
export function createIslandBuzzEffects(renderer){
 let target=null,quadScene=null,quadCamera=null,material=null;
 const size=new T.Vector2(),savedRotation=new T.Quaternion();
 function prepare(){
  renderer.getDrawingBufferSize(size);
  if(!target){
   target=new T.WebGLRenderTarget(size.x,size.y);
   material=new T.ShaderMaterial({uniforms:{image:{value:target.texture},strength:{value:0},time:{value:0},resolution:{value:size.clone()}},vertexShader:'varying vec2 uvPass;void main(){uvPass=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
    uniform sampler2D image;uniform float strength;uniform float time;uniform vec2 resolution;varying vec2 uvPass;
    void main(){
     float s=strength;vec2 uv=uvPass;
     uv+=vec2(sin(uv.y*9.+time*1.4),cos(uv.x*8.+time*1.1))*s*s*.0035;
     uv=clamp(uv,vec2(.002),vec2(.998));vec2 pixel=1./resolution;
     vec3 color=texture2D(image,uv).rgb;float edge=smoothstep(.08,.65,distance(uv,vec2(.5)));
     vec2 softness=pixel*(1.+edge*3.)*s;
     vec3 blurred=color*.4+(texture2D(image,uv+softness).rgb+texture2D(image,uv-softness).rgb+texture2D(image,uv+vec2(softness.x,-softness.y)).rgb+texture2D(image,uv+vec2(-softness.x,softness.y)).rgb)*.15;
     color=mix(color,blurred,s*(.3+edge*.5));float ghost=clamp((s-.22)/.78,0.,1.);
     vec2 shift=vec2((.007+sin(time*.8)*.0035)*ghost,sin(time*.65)*.0025*ghost);
     color=mix(color,texture2D(image,clamp(uv+shift,vec2(.001),vec2(.999))).rgb,ghost*.28);
     color.r=mix(color.r,texture2D(image,clamp(uv-shift*.6,vec2(.001),vec2(.999))).r,ghost*.45);
     color=mix(color,color*vec3(1.035,1.01,.965),s*.45);
     float vignette=smoothstep(.2,.8,distance(uv,vec2(.5)))*s*.22;
     gl_FragColor=vec4(color*(1.-vignette),1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`});
   quadScene=new T.Scene();quadCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);quadScene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  }
  if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
  material.uniforms.resolution.value.copy(size);
 }
 function reset(){if(quadScene)for(const node of quadScene.children)node.geometry?.dispose();material?.dispose();target?.dispose();target=material=quadScene=quadCamera=null;}
 return {render(scene,camera,state,{time=0,reducedMotion=false}={}){
  const strength=Number(state?.effects?.strength)||0;if(reducedMotion||renderer.xr?.isPresenting||strength<.01)return false;
  prepare();material.uniforms.strength.value=Math.max(0,Math.min(1,strength));material.uniforms.time.value=time;
  const previous=renderer.getRenderTarget();savedRotation.copy(camera.quaternion);
  try{camera.rotateZ(Math.sin(time*.95)*Math.pow(strength,2)*.025);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(previous);renderer.render(quadScene,quadCamera);}
  finally{camera.quaternion.copy(savedRotation);camera.updateMatrixWorld();renderer.setRenderTarget(previous);}
  return true;
 },reset,dispose:reset};
}
