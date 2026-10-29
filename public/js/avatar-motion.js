// Presentation only: use already-rendered positions, never extra input packets.
// Each avatar owns one reusable numeric sample; teleports are not walking.
export function sampleAvatarMotion(root,position,delta,blocked=false,reducedMotion=false){
 const data=root.userData,state=data.avatarMotion||(data.avatarMotion={x:0,y:0,z:0,initialized:false,speed:0,moving:false,reducedMotion:false});
 const x=Number(position?.x),y=Number(position?.y),z=Number(position?.z),dt=Number(delta);
 state.reducedMotion=!!reducedMotion;
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)){state.initialized=false;state.speed=0;state.moving=false;return state;}
 const distance=state.initialized?Math.hypot(x-state.x,z-state.z):0;
 const reset=!state.initialized||!Number.isFinite(dt)||dt<=0||dt>.25||distance>Math.max(2,dt*14);
 state.x=x;state.y=y;state.z=z;state.initialized=true;
 if(blocked||reset){state.speed=0;state.moving=false;return state;}
 const speed=Math.min(8,distance/dt);
 state.speed+=(speed-state.speed)*Math.min(1,dt*14);
 if(state.speed<.025)state.speed=0;
 state.moving=state.speed>.08;
 return state;
}

const controllers=new WeakMap();
const clipName=clip=>String(clip?.name||'').toLowerCase();

// Reuse authored idle/walk/run clips when they exist. Keep one action active,
// including after many state changes, so the mixer budget cannot accumulate.
export function configureAvatarAnimations(THREE,owner,model,clips=[]){
 clearAvatarAnimations(owner);
 if(!clips.length)return null;
 const mixer=new THREE.AnimationMixer(model),idle=clips.find(clip=>/idle|standing|breath/.test(clipName(clip)))||clips[0];
 const walk=clips.find(clip=>/walk|locomotion/.test(clipName(clip)));
 const run=clips.find(clip=>/run|jog|sprint/.test(clipName(clip)));
 const actions=new Map();
 for(const clip of new Set([idle,walk,run].filter(Boolean)))actions.set(clip,mixer.clipAction(clip));
 const state={mixer,model,idle,walk,run,actions,active:idle};
 actions.get(idle).play();controllers.set(owner,state);
 owner.userData.serverMixer=mixer;owner.userData.serverMixerRoot=model;
 return mixer;
}

export function updateAvatarAnimations(owner,delta,motion){
 const state=controllers.get(owner);if(!state)return;
 const clip=motion?.moving?(motion.speed>3.2?(state.run||state.walk||state.idle):(state.walk||state.run||state.idle)):state.idle;
 if(clip!==state.active){state.actions.get(state.active).stop();state.actions.get(clip).reset().play();state.active=clip;}
 const dt=Math.max(0,Math.min(.1,Number(delta)||0));
 state.mixer.update(dt);
}

export function clearAvatarAnimations(owner){
 const state=controllers.get(owner);
 const mixer=state?.mixer||owner.userData.serverMixer;
 mixer?.stopAllAction();mixer?.uncacheRoot(state?.model||owner.userData.serverMixerRoot||owner.userData.serverAvatarModel||owner);
 controllers.delete(owner);delete owner.userData.serverMixer;delete owner.userData.serverMixerRoot;
}
