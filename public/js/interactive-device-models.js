import {INTERACTIVE_DEVICES,deviceArtworkUrl} from './interactive-devices.js';
import {finishGameItem} from './game-item-finish.js';

// Reuse the bounded set of catalogue displays across cabinet instances/worlds.
const displayTextures=new Map();
function displayTexture(THREE,profile,marquee=false,aspect=2){
 if(typeof document==='undefined')return null;
 const key=profile.name+':'+marquee+':'+aspect.toFixed(4);if(displayTextures.has(key))return displayTextures.get(key);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=marquee?96:Math.round(512/Math.max(1,aspect));const height=canvas.height,mid=height*.58;
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 const accent='#'+profile.color.toString(16).padStart(6,'0'),gradient=ctx.createLinearGradient(0,0,512,height);gradient.addColorStop(0,'#17283e');gradient.addColorStop(1,'#060d18');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,canvas.height);
 ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.strokeRect(8,8,496,canvas.height-16);
 ctx.fillStyle=accent;ctx.font='700 15px system-ui';ctx.fillText('MZK  /  '+(profile.kind==='arcade'?'ARCADE':profile.kind.toUpperCase()),24,marquee?29:31);
 let size=marquee?27:26;do{ctx.font=`800 ${size--}px system-ui`;}while(ctx.measureText(profile.name).width>462&&size>14);
 ctx.fillStyle='#f3f8ff';ctx.fillText(profile.name,24,marquee?66:68);
 if(!marquee&&height<220){ctx.fillStyle='#a6bfd6';ctx.font='600 13px system-ui';ctx.fillText('READY  •  INTERACT TO OPEN',24,height-16);}
 else if(!marquee){
  ctx.globalAlpha=.12;ctx.strokeStyle=accent;ctx.lineWidth=1;for(let x=24;x<490;x+=24){ctx.beginPath();ctx.moveTo(x,85);ctx.lineTo(x,height-38);ctx.stroke();}for(let y=94;y<height-38;y+=24){ctx.beginPath();ctx.moveTo(24,y);ctx.lineTo(488,y);ctx.stroke();}ctx.globalAlpha=1;
  if(['poker','slots'].includes(profile.kind)||profile.game==='blackjack'){
   const count=profile.kind==='slots'?3:5,w=profile.kind==='slots'?102:62;
   for(let i=0;i<count;i++){const x=(512-count*(w+12))/2+i*(w+12);ctx.fillStyle='#e5ebde';ctx.fillRect(x,mid-51,w,102);ctx.fillStyle=i%2?'#c53d59':'#13293a';ctx.font='800 35px system-ui';ctx.fillText(profile.kind==='slots'?['7','★','7'][i]:['A','K','Q','J','10'][i],x+10,mid+13);}
  }else if(profile.game==='pong'||profile.game==='breakout'){
   ctx.fillStyle=accent;ctx.fillRect(66,mid-20,8,59);ctx.fillRect(438,mid-38,8,59);ctx.beginPath();ctx.arc(254,mid,8,0,Math.PI*2);ctx.fill();
  }else if(profile.kind==='arcade'||profile.kind==='trivia'){
   ctx.fillStyle=accent;for(let i=0;i<9;i++)ctx.fillRect(110+i*25,mid+Math.round(Math.sin(i*.75))*22,18,18);ctx.fillStyle='#ffcf7a';ctx.fillRect(375,mid-43,13,13);
  }else{
   ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.beginPath();ctx.arc(256,mid,43,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#eef7ff';ctx.beginPath();ctx.moveTo(247,mid-20);ctx.lineTo(247,mid+20);ctx.lineTo(278,mid);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle='#a6bfd6';ctx.font='600 13px system-ui';ctx.fillText('READY  •  INTERACT TO OPEN',24,height-20);
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;displayTextures.set(key,texture);return texture;
}

export function createInteractiveDevice(THREE,id){
 const profile=INTERACTIVE_DEVICES[id];if(!profile)return null;
 const root=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color:0x1c2b3b,roughness:.48,metalness:.24}),trim=new THREE.MeshStandardMaterial({color:0x566779,roughness:.3,metalness:.72}),rubber=new THREE.MeshStandardMaterial({color:0x101620,roughness:.88}),accent=new THREE.MeshStandardMaterial({color:profile.color,emissive:profile.color,emissiveIntensity:.35,roughness:.34,metalness:.18}),screenMaterial=new THREE.MeshStandardMaterial({color:0x07101b,roughness:.2,metalness:.12});
 const part=(size,position,material=paint,name='')=>{const value=new THREE.Mesh(new THREE.BoxGeometry(...size),material);value.position.set(...position);value.name=name;root.add(value);return value;};
 const cylinder=(radius,height,position,material=trim)=>{const value=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,16),material);value.position.set(...position);root.add(value);return value;};
 const screen=(width,height,position)=>{
  part([width+.12,height+.12,.07],[position[0],position[1],position[2]+.012],rubber,'DISPLAY_BEZEL');
  const value=part([width,height,.06],position,screenMaterial,'DEVICE_SCREEN');value.userData.mediaScreen=true;
  const texture=displayTexture(THREE,profile,false,width/height);if(texture){const face=new THREE.Mesh(new THREE.PlaneGeometry(width*.96,height*.96),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));face.rotation.y=Math.PI;face.position.z=-.031;face.name='DEVICE_IDLE_DISPLAY';face.userData.collisionDisabled=true;value.add(face);}return value;
 };
 const shape=profile.shape,wide=shape==='cinema',speaker=shape==='speaker'||shape==='jukebox',table=shape==='table'||shape==='deck';
 const width=wide?5:table?2.4:speaker?1.8:1.5,height=wide?3.3:table?1.2:speaker?1.3:2.2;
 part([width,.14,.9],[0,.07,0],rubber,'PLINTH');
 if(table){
  for(const x of [-width*.36,width*.36])part([.14,height-.14,.7],[x,height/2+.07,.08],paint,'TABLE_SUPPORT');
  part([width+.15,.12,1.3],[0,height,0],trim,'TABLE_RAIL');
  part([width-.12,.035,1.08],[0,height+.078,0],new THREE.MeshStandardMaterial({color:shape==='deck'?0x182730:0x155b47,roughness:.92}),'FELT_SURFACE');
  if(shape==='deck')for(const x of [-.7,.7]){cylinder(.32,.035,[x,height+.11,0],rubber);cylinder(.095,.045,[x,height+.13,0],accent);}
  else{for(let i=0;i<5;i++)part([.19,.012,.29],[-.48+i*.24,height+.1,-.18],i%2?accent:screenMaterial,'CARD_PLACE');screen(1.2,.65,[0,1.65,.45]);part([.1,.5,.1],[0,1.35,.48],trim,'DISPLAY_STAND');}
 }else{
  part([width*.92,height-.14,.6],[0,height/2+.07,.12],paint,'CABINET_BODY');
  if(speaker){
   // Recessed cones, chrome rings and a separate control/display band.
   for(const x of [-width*.25,width*.25]){
    const cone=cylinder(.265,.055,[x,height*.41,-.215],rubber);cone.rotation.x=Math.PI/2;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.266,.022,6,24),trim);ring.position.set(x,height*.41,-.254);root.add(ring);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.092,12,8),paint);cap.scale.z=.28;cap.position.set(x,height*.41,-.26);root.add(cap);
   }
   screen(width*.67,height*.18,[0,height*.76,-.23]);
   for(const x of [-width*.32,width*.32]){const knob=cylinder(.042,.04,[x,height*.76,-.29],accent);knob.rotation.x=Math.PI/2;}
  }else{
   screen(width*.82,height*.5,[0,height*.61,-.23]);
   const panel=part([width*.8,.12,.26],[0,height*.26,-.3],trim,'CONTROL_DECK');panel.rotation.x=.1;
   if(shape==='arcade'){
    cylinder(.055,.17,[-width*.23,height*.26+.13,-.32],rubber);
    const ball=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),accent);ball.position.set(-width*.23,height*.26+.23,-.32);root.add(ball);
    const buttons=new THREE.InstancedMesh(new THREE.CylinderGeometry(.035,.04,.018,12),accent,6),matrix=new THREE.Matrix4();
    for(let i=0;i<6;i++){matrix.makeTranslation(width*.08+i%3*.105,height*.26+.073,-.37+Math.floor(i/3)*.09);buttons.setMatrixAt(i,matrix);}buttons.name='ARCADE_BUTTONS';buttons.userData.collisionDisabled=true;root.add(buttons);
   }
   const slot=part([width*.24,.12,.015],[width*.17,height*.15,-.19],rubber,'CARD_SLOT');slot.userData.collisionDisabled=true;
  }
  for(const x of [-width/2+.075,width/2-.075])part([.065,height-.12,.08],[x,height/2+.06,-.19],accent,'EDGE_LIGHT');
  // Recessed lower grille uses one draw call for the repeated slats.
  const grille=new THREE.InstancedMesh(new THREE.BoxGeometry(width*.42,.018,.012),rubber,5),matrix=new THREE.Matrix4();for(let i=0;i<5;i++){matrix.makeTranslation(0,.2+i*.045,-.19);grille.setMatrixAt(i,matrix);}grille.name='VENT_GRILLE';grille.userData.collisionDisabled=true;root.add(grille);
  const marquee=displayTexture(THREE,profile,true);if(marquee){const face=new THREE.Mesh(new THREE.PlaneGeometry(width*.82,height*.1),new THREE.MeshBasicMaterial({map:marquee,toneMapped:false}));face.position.set(0,height*.955,-.188);face.rotation.y=Math.PI;face.name='DEVICE_MARQUEE';face.userData.collisionDisabled=true;root.add(face);}
 }
 if(shape==='karaoke'){cylinder(.12,.035,[1.05,.018,0],rubber);cylinder(.025,2.5,[1.05,1.28,0],trim);const mic=cylinder(.06,.22,[1.05,2.57,0],rubber);mic.rotation.z=.9;}
 if(shape==='projector'){part([.5,.3,.7],[.48,2.15,.1],paint,'PROJECTOR');const lens=cylinder(.095,.055,[.48,2.15,-.27],accent);lens.rotation.x=Math.PI/2;}
 if(typeof document!=='undefined'&&!table){
  const texture=new THREE.TextureLoader().load(deviceArtworkUrl(id),undefined,undefined,()=>{});texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});
  for(const side of [-1,1]){const poster=new THREE.Mesh(new THREE.PlaneGeometry(.5,height*.72),material);poster.position.set(side*(width*.46+.004),height*.52,.1);poster.rotation.y=side*Math.PI/2;poster.userData.collisionDisabled=true;poster.name='CABINET_ARTWORK';root.add(poster);}
 }
 root.name=profile.name;root.userData={modelId:id,builderObject:true,interactiveDevice:id,dimensions:[width,height,.9]};return finishGameItem(THREE,root);
}
