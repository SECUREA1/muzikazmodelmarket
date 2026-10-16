// Original, synthesized arcade chimes; no sampled game audio or network fetch.
export function playPickupChime(context,output,{coin=false,volume=1}={}){
 if(!context||context.state!=='running'||volume<=0)return;
 const notes=coin?[988,1482,1976]:[660,880,1320];
 notes.forEach((frequency,index)=>{
  const start=context.currentTime+index*.055,oscillator=context.createOscillator(),gain=context.createGain();
  oscillator.type=coin?'square':'triangle';oscillator.frequency.setValueAtTime(frequency,start);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.045*volume,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+.12);
  oscillator.connect(gain);gain.connect(output||context.destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start+.13);
 });
}
export function createMzkToken(THREE){
 const root=new THREE.Group(),token=new THREE.Group();root.add(token);token.position.y=.65;
 const gold=new THREE.MeshStandardMaterial({color:0xffd84d,metalness:.72,roughness:.25,emissive:0x8c5100,emissiveIntensity:.5});
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.075,24),gold);body.rotation.x=Math.PI/2;token.add(body);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.255,.025,6,24),new THREE.MeshBasicMaterial({color:0xfff3ad}));ring.position.z=.045;token.add(ring);
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#402609';ctx.font='900 62px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('MZK',128,128);
 const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide});
 for(const z of [-.044,.044]){const face=new THREE.Mesh(new THREE.PlaneGeometry(.54,.54),material.clone());face.position.z=z;if(z<0)face.rotation.y=Math.PI;token.add(face);}material.dispose();
 root.userData.serverLoot=true;root.userData.mzkToken=token;return root;
}
export function animateMzkToken(root,delta,elapsed){const token=root.userData.mzkToken;if(!token)return;token.rotation.y+=delta*2.3;token.position.y=.65+Math.sin(elapsed*3+root.position.x)*.09;}
