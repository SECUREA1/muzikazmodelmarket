// Presentation only: server snapshots own position, attacks, health and rewards.
export function animateSharedEnemy(root,delta,elapsed) {
 const state=root.userData,controller=state.serverController,kind=state.serverKind;
 controller?.mixer?.update(delta);
 controller?.attackTell?.update(delta);controller?.attackFlash?.update(delta);
 const tell=state.attack?.phase==='tell',token=state.attack?.readyAt;
 if(tell&&controller?.attackTell&&state.tellToken!==token){controller.attackTell.play();state.tellToken=token;}
 if(!tell){controller?.attackTell?.stop();state.tellToken=null;}
 if(state.lastAttack&&state.flashToken!==state.lastAttack){
  state.flashToken=state.lastAttack;controller?.attackTell?.stop();controller?.attackFlash?.play();state.attackVisualTime=.25;
 }
 state.attackVisualTime=Math.max(0,(state.attackVisualTime||0)-delta);
 controller?.legs?.forEach((leg,index)=>leg.rotation.y=Math.sin(elapsed*10+index)*.22);
 controller?.wings?.forEach((wing,index)=>wing.rotation.z=Math.sin(elapsed*18+index*Math.PI)*.7);
 if(controller?.sword)controller.sword.rotation.z=state.attackVisualTime>0?-2.2:-.65+Math.sin(elapsed*3)*.08;
 state.parts?.forEach((part,index)=>{part.position.x=Math.sin(elapsed*7-index*.7)*.09;});
 if(state.ring)state.ring.rotation.z=elapsed;
 if(state.halo)state.halo.material.opacity=.55+Math.sin(elapsed*3)*.15;
 state.visualBases ||= new WeakMap();
 const amplitude=kind==='ghost'?.16:kind==='toxic'?.12:kind==='boss'?.18:kind==='brain'?.035:0;
 for(const child of root.children){
  if(!state.visualBases.has(child))state.visualBases.set(child,{y:child.position.y,scale:child.scale.clone()});
  const base=state.visualBases.get(child);child.position.y=base.y+Math.sin(elapsed*(kind==='brain'?4:2.1))*amplitude;
  if(child.isSprite&&!controller){const pulse=1+Math.sin(elapsed*3)*.035;child.scale.copy(base.scale).multiplyScalar(pulse);}
 }
 state.gas?.children.forEach((puff,index)=>{puff.material.opacity=.22+Math.sin(elapsed*1.8+index)*.1;});
}
