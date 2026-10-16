// Audio levels come from each received MediaStream, never from a speaking timer.
export function updateVoiceOverlay(THREE,root,user,level=0,now=Date.now()){
 let overlay=root.userData.roomVoiceOverlay;
 if(!user?.voiceEnabled){if(overlay)overlay.visible=false;return;}
 if(!overlay){
  overlay=new THREE.Group();overlay.name='Room_voice_overlay';root.add(overlay);root.userData.roomVoiceOverlay=overlay;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
  const material=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false});
  const label=new THREE.Sprite(material);label.userData.voiceOverlay=true;label.position.y=2.75;label.scale.set(2.8,1.05,1);label.renderOrder=30;overlay.add(label);
  const bars=[];for(let i=0;i<5;i++){const bar=new THREE.Mesh(new THREE.PlaneGeometry(.045,.22),new THREE.MeshBasicMaterial({color:0x36ff82,transparent:true,depthTest:false}));bar.position.set((i-2)*.075,2.22,0);bar.renderOrder=31;overlay.add(bar);bars.push(bar);}
  overlay.userData={canvas,label,bars};
 }
 overlay.visible=true;
 const state=overlay.userData,caption=user.voiceCaption&&now-Number(user.voiceCaptionAt)<6500?user.voiceCaption:'';
 if(state.caption!==caption){
  state.caption=caption;const ctx=state.canvas.getContext('2d');ctx.clearRect(0,0,512,192);ctx.fillStyle='rgba(2,16,8,.88)';ctx.fillRect(0,0,512,192);ctx.fillStyle='#36ff82';ctx.textAlign='center';ctx.font='bold 25px system-ui';ctx.fillText('● MIC READY',256,34);ctx.fillStyle='#fff';ctx.font='24px system-ui';
  const words=String(caption).split(/\s+/);let line='',lines=[];
  for(const word of words){if(ctx.measureText(line+' '+word).width>480&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);
  lines.slice(0,4).forEach((text,index)=>ctx.fillText(text,256,67+index*29,480));state.label.material.map.needsUpdate=true;
 }
 const energy=Math.max(0,Math.min(1,Number(level)||0));
 state.bars.forEach((bar,index)=>{bar.scale.y=.15+energy*(1-Math.abs(index-2)*.22)*1.8;bar.material.opacity=energy>.06?1:.45;});
}

export function disposeVoiceOverlay(root){
 const overlay=root.userData.roomVoiceOverlay;if(!overlay)return;
 overlay.removeFromParent();overlay.traverse(object=>{object.geometry?.dispose();object.material?.map?.dispose();object.material?.dispose();});delete root.userData.roomVoiceOverlay;
}
