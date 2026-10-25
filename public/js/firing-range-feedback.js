import {createSpatialEffectOutput,updateAudioListener} from './shared-effect-audio.js';
// Presentation only: the server determines every shot, hit and score.
export function rangeRecoilStrength(tool) {
 return ({marksman:.018,'rail-cannon':.028,'scatter-shot':.025,'pulse-rifle':.011,'heavy-bolt':.022,'pulse-pistol':.014})[tool]||.009;
}
export function decayRangeRecoil(value,delta) {
 return value*Math.exp(-14*Math.max(0,Math.min(.1,delta)));
}
export function createFiringRangeFeedback({THREE,scene,camera,canvas,reducedMotion=false,getVolume=()=>1,getSpatialAudio=()=>true,getReducedMotion=()=>reducedMotion}) {
 let recoil=0,audio=null,enabled=false;
 const inputRoot=canvas.closest?.('.house-stage')||canvas;
 const sounds=new Set(),listenerPosition=new THREE.Vector3(),listenerDirection=new THREE.Vector3(),listenerUp=new THREE.Vector3();
 const effects=[],material=new THREE.LineBasicMaterial({color:0xffdca0,transparent:true,opacity:.65,depthWrite:false}),flashMaterial=new THREE.MeshBasicMaterial({color:0xffd795,transparent:true,depthWrite:false,toneMapped:false});
 const flashGeometry=new THREE.SphereGeometry(.035,8,6);
 const primeAudio=()=>{if(!enabled||getVolume()<=0)return;const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)return;try{audio ||= new Context();audio.resume().catch(()=>{});}catch{}};
 inputRoot.addEventListener('pointerdown',primeAudio,true);inputRoot.addEventListener('keydown',primeAudio,true);
 function listener(){camera.getWorldPosition(listenerPosition);camera.getWorldDirection(listenerDirection);listenerUp.set(0,1,0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));return {listener:listenerPosition,direction:listenerDirection,up:listenerUp};}
 function updateSound(sound){sound.output.update({...listener(),source:sound.position,spatial:getSpatialAudio()&&!sound.local,volume:getVolume()});}
 function report(tool,position,local=false){
  if(!audio||audio.state!=='running'||getVolume()<=0||sounds.size>=16)return;
  const duration=.13,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/samples.length*8);
  const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain(),output=createSpatialEffectOutput(audio,{range:45}),sound={source,output,position,local};source.buffer=buffer;filter.type='lowpass';filter.frequency.value=tool==='marksman'?2300:1700;gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);source.connect(filter);filter.connect(gain);gain.connect(output.input);sounds.add(sound);updateSound(sound);source.onended=()=>{sounds.delete(sound);source.disconnect();filter.disconnect();gain.disconnect();output.dispose();};source.start();
 }
 return {
  shot(event,local=false){
   if(!event.origin||!event.end)return;
   let effect=effects.find(item=>item.age>=.09);
   if(!effect&&effects.length<12){const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),line=new THREE.Line(geometry,material.clone()),flash=new THREE.Mesh(flashGeometry,flashMaterial.clone());line.name='RANGE_BRIEF_TRACER';flash.name='RANGE_MUZZLE_FLASH';scene.add(line,flash);effect={line,flash,age:1};effects.push(effect);}
   if(!effect)return;
   const origin=new THREE.Vector3(event.origin.x,event.origin.y,event.origin.z),end=new THREE.Vector3(event.end.x,event.end.y,event.end.z),direction=end.clone().sub(origin).normalize();
   // The report follows the confirmed ray; only the muzzle is offset visually.
   const right=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize(),muzzle=origin.clone().addScaledVector(direction,.5).addScaledVector(right,.14);muzzle.y-=.12;
   const tail=end.clone().addScaledVector(direction,-Math.min(4,origin.distanceTo(end)));
   const attribute=effect.line.geometry.getAttribute('position');attribute.setXYZ(0,tail.x,tail.y,tail.z);attribute.setXYZ(1,end.x,end.y,end.z);attribute.needsUpdate=true;effect.line.geometry.computeBoundingSphere();effect.flash.position.copy(muzzle);effect.age=0;effect.line.visible=effect.flash.visible=true;
   if(local)recoil=Math.min(.055,recoil+rangeRecoilStrength(event.tool));
   report(event.tool,origin,local);
  },
  update(delta,active){
   enabled=active;recoil=decayRangeRecoil(recoil,delta);
   if(audio){const pose=listener();updateAudioListener(audio,pose.listener,pose.direction,pose.up);for(const sound of sounds)updateSound(sound);}
   if(active&&!getReducedMotion())camera.rotation.x+=recoil;
   for(const effect of effects){effect.age+=delta;effect.line.visible=active&&effect.age<.055;effect.flash.visible=active&&!getReducedMotion()&&effect.age<.035;effect.line.material.opacity=Math.max(0,.65*(1-effect.age/.055));effect.flash.material.opacity=Math.max(0,1-effect.age/.035);}
  },
  reset(){recoil=0;for(const sound of sounds){sound.source.stop();sound.output.dispose();}sounds.clear();for(const effect of effects){effect.age=1;effect.line.visible=effect.flash.visible=false;}},
  destroy(){inputRoot.removeEventListener('pointerdown',primeAudio,true);inputRoot.removeEventListener('keydown',primeAudio,true);this.reset();for(const effect of effects){effect.line.geometry.dispose();effect.line.material.dispose();effect.flash.material.dispose();effect.line.removeFromParent();effect.flash.removeFromParent();}material.dispose();flashGeometry.dispose();flashMaterial.dispose();audio?.close();}
 };
}
