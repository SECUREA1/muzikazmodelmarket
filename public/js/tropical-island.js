import * as T from '../vendor/three/three.module.min.js';
import {createTropicalIslandWorld, animateTropicalIslandWorld} from './tropical-island-world.js';
import {createIslandSession,startIslandSession,stepIslandSession,finishIslandSession,consumeIslandDrink,visitIslandExperience,islandEffects} from './tropical-island-rules.js';
import {readGameCameraMode,writeGameCameraMode} from './game-camera.js';
import {mountRadToxController} from './rad-tox-controller.js';
import {mountWorldSupplyUI} from './world-supply-ui.js';
import {SharedGameInventory} from './shared-game-inventory.js';

const $=selector=>document.querySelector(selector);
const descriptions={
  'tiki-bar':['🍹','Beach bar','A tropical refreshment, with or without alcohol.','Visit bar'],
  'sunset-bar':['☀','Beach bar','The best sea view on the east coast.','Visit bar'],
  cabanas:['☂','Relax','Put your feet up in a private beach cabana.','Lounge'],
  'beach-ball':['◉','Beach games','Kick a colorful beach ball across the sand.','Kick ball'],
  'paddle-boat':['♧','On the water','Paddle to the glowing lagoon buoys. E returns to the pier.','Go paddling'],
  pontoon:['⚓','Island cruise','Hop aboard a scenic cruise around the island. E returns to the dock.','Board pontoon'],
  snorkel:['≈','Reef explorer','Take a dip over the colorful coral garden.','Go snorkeling'],
  lookout:['⌖','Scenic stop','Watch the horizon from the island lookout.','Take in the view']
};
let world,scene,camera,renderer,postScene,postCamera,target,postMaterial,controller;
let session=createIslandSession(),player={x:0,z:24,heading:Math.PI},avatar,nearby=null,waypoint=null;
let view=readGameCameraMode('top-down')==='first-person'?'first-person':'top-down',boat=null,boatAngle=0,activity=null,activityUntil=0;
let yaw=0,pitch=-.04,zoom=32,drag=null,last=performance.now(),visualTime=0,toastUntil=0,lastHud=0;
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,showController=matchMedia('(pointer:coarse)').matches;
let sound=false,audio=null,lastFootstep=0,hasShownResults=false,stick={x:0,y:0};
let overview=false,sessionAt=performance.now();
const keys=new Set(),ballVelocities=new Map(),buoys=[],waypointRing=new T.Group();
const mapCanvas=$('#map-canvas'),mapCtx=mapCanvas.getContext('2d');
const cameraPosition=new T.Vector3(),cameraTarget=new T.Vector3(),cameraLook=new T.Vector3();
const formatTime=seconds=>{const s=Math.max(0,Math.ceil(seconds));return (s>=3600?Math.floor(s/3600)+':'+String(Math.floor(s/60)%60).padStart(2,'0'):Math.floor(s/60))+':'+String(s%60).padStart(2,'0');};

function notify(message,seconds=3){$('#toast').textContent=message;$('#toast').classList.add('show');toastUntil=performance.now()+seconds*1000;}
function beep(frequency=500,duration=.14){if(!sound)return;try{audio??=new AudioContext();audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,audio.currentTime);gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);}catch{}}
function clearInput(){keys.clear();stick={x:0,y:0};controller?.reset();drag=null;}
function running(){return session.status==='running';}
function syncSessionTime(now=performance.now()){const current=Math.max(sessionAt,now);if(running())stepIslandSession(session,(current-sessionAt)/1000);sessionAt=current;}
function menuOpen(){return !!document.querySelector('dialog[open]');}
function canControl(){return running()&&!menuOpen()&&!document.hidden;}
function setCameraMode(){overview=false;view=view==='first-person'?'top-down':'first-person';writeGameCameraMode(view);syncView();beep(420);}
function toggleOverview(){if(!running())return;overview=!overview;if(overview){const distance=innerWidth<innerHeight?105/(innerWidth/innerHeight):105;cameraPosition.set(38,distance*.8,distance*.75);}syncView();notify(overview?'Palm Coast Resort · the whole island at a glance. M returns to your view.':'Back to your island adventure.',2);}
function syncView(){$('#view-button').innerHTML=(overview?'Island map':view==='first-person'?'First person':'Top down')+' <span>V</span>';$('#map-overview-button').setAttribute('aria-pressed',String(overview));$('#crosshair').hidden=overview||view!=='first-person'||!running();if(avatar)avatar.visible=overview||view!=='first-person'||!running();}
function syncController(){document.body.classList.toggle('controller-visible',showController&&running());}
function stamp(id){const result=visitIslandExperience(session,id);if(result.ok&&!result.alreadyVisited){beep(720);notify(session.visits.length===8?'Passport complete! All eight island experiences discovered. Keep enjoying paradise.':'Passport stamped · '+world.interactionPoints.find(p=>p.id===id).label+' · +100');updateHud();}return result;}

function makeAvatar(){
  const root=new T.Group();root.name='ISLAND_VISITOR';
  const mat=color=>new T.MeshStandardMaterial({color,roughness:.8});
  const body=new T.Mesh(new T.CapsuleGeometry(.28,.45,4,8),mat('#d5fa78'));body.position.y=1.05;root.add(body);
  const head=new T.Mesh(new T.SphereGeometry(.23,12,8),mat('#bd875b'));head.position.y=1.62;root.add(head);
  const hat=new T.Mesh(new T.CylinderGeometry(.42,.42,.08,14),mat('#fff2c8'));hat.position.y=1.83;root.add(hat);
  const crown=new T.Mesh(new T.CylinderGeometry(.24,.3,.23,14),mat('#fff2c8'));crown.position.y=1.96;root.add(crown);
  const legs=[];for(const x of [-.14,.14]){const leg=new T.Mesh(new T.CapsuleGeometry(.1,.35,3,6),mat('#21596a'));leg.position.set(x,.42,0);root.add(leg);legs.push(leg);}
  const marker=new T.Mesh(new T.RingGeometry(.48,.63,24),new T.MeshBasicMaterial({color:'#efff8a',side:T.DoubleSide,transparent:true,opacity:.9}));marker.rotation.x=-Math.PI/2;marker.position.y=.025;root.add(marker);
  root.userData.legs=legs;return root;
}
function createPostProcess(){
  target=new T.WebGLRenderTarget(innerWidth,innerHeight,{depthBuffer:true});
  postMaterial=new T.ShaderMaterial({uniforms:{image:{value:target.texture},strength:{value:0},time:{value:0},resolution:{value:new T.Vector2(innerWidth,innerHeight)}},vertexShader:'varying vec2 uvPass;void main(){uvPass=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
    uniform sampler2D image;uniform float strength;uniform float time;uniform vec2 resolution;varying vec2 uvPass;
    void main(){
      vec2 uv=uvPass;float s=strength;vec2 pixel=1.0/resolution;
      uv+=vec2(sin(uv.y*9.0+time*1.4),cos(uv.x*8.0+time*1.1))*s*s*.0035;
      uv=clamp(uv,vec2(.002),vec2(.998));
      vec3 color=texture2D(image,uv).rgb;
      float edge=smoothstep(.08,.65,distance(uv,vec2(.5)));
      vec2 softness=pixel*(1.+edge*3.)*s;
      vec3 blurred=color*.4+(texture2D(image,uv+softness).rgb+texture2D(image,uv-softness).rgb+texture2D(image,uv+vec2(softness.x,-softness.y)).rgb+texture2D(image,uv+vec2(-softness.x,softness.y)).rgb)*.15;
      color=mix(color,blurred,s*(.3+edge*.5));
      float ghost=clamp((s-.22)/.78,0.,1.);
      vec2 shift=vec2((.007+sin(time*.8)*.0035)*ghost,sin(time*.65)*.0025*ghost);
      color=mix(color,texture2D(image,clamp(uv+shift,vec2(.001),vec2(.999))).rgb,ghost*.28);
      color.r=mix(color.r,texture2D(image,clamp(uv-shift*.6,vec2(.001),vec2(.999))).r,ghost*.45);
      color=mix(color,color*vec3(1.035,1.01,.965),s*.45);
      float vignette=smoothstep(.2,.8,distance(uv,vec2(.5)))*s*.22;
      gl_FragColor=vec4(color*(1.-vignette),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  postScene=new T.Scene();postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),postMaterial));
}
function createMarkers(){
  for(const [index,pos] of [[54,8],[55,-9],[47,-29]].entries()){
    const root=new T.Group();root.position.set(pos[0],1.2,pos[1]);
    const ring=new T.Mesh(new T.TorusGeometry(1.8,.12,6,32),new T.MeshStandardMaterial({color:'#dcff8d',emissive:'#7ca732',emissiveIntensity:.4}));root.add(ring);scene.add(root);buoys.push({root,x:pos[0],z:pos[1],hit:false,index});
  }
  const ring=new T.Mesh(new T.RingGeometry(1.1,1.35,32),new T.MeshBasicMaterial({color:'#e7ff90',side:T.DoubleSide,transparent:true,opacity:.75}));ring.rotation.x=-Math.PI/2;waypointRing.add(ring);
  const pole=new T.Mesh(new T.CylinderGeometry(.035,.035,5,6),new T.MeshBasicMaterial({color:'#dfff83',transparent:true,opacity:.65}));pole.position.y=2.5;waypointRing.add(pole);scene.add(waypointRing);waypointRing.visible=false;
}
function makePassport(){
  for(const point of world.interactionPoints){
    const [icon,type]=descriptions[point.id],button=document.createElement('button');button.className='destination';button.dataset.destination=point.id;
    button.innerHTML=`<span class="dest-icon">${icon}</span><span><b>${point.label}</b><small>${type}</small></span><span class="check">↗</span>`;
    button.onclick=()=>{waypoint=point;waypointRing.position.set(point.x,world.groundHeight(point.x,point.z)+.08,point.z);waypointRing.visible=true;notify('Waypoint set · '+point.label,2);updateHud();};$('#destinations').append(button);
  }
}
function start(){
  clearInput();session=createIslandSession();startIslandSession(session,performance.now());last=sessionAt=performance.now();hasShownResults=false;overview=false;boat=null;activity=null;nearby=null;waypoint=null;waypointRing.visible=false;
  player={x:world.spawn.x,z:world.spawn.z,heading:Math.PI};yaw=0;pitch=-.04;
  for(const item of world.boats){item.root.position.x=item.home.x;item.root.position.z=item.home.z;item.root.rotation.y=item.home.heading;}
  for(const item of world.balls){item.root.position.set(item.home.x,item.root.userData.restY,item.home.z);ballVelocities.delete(item.root);}
  for(const buoy of buoys){buoy.hit=false;buoy.root.children[0].material.color.set('#dcff8d');}
  $('#welcome').hidden=true;$('#results').hidden=true;document.body.classList.add('island-playing');
  for(const selector of ['#round-hud','#passport','#buzz-panel','#minimap','#interaction'])$(selector).hidden=false;
  $('#passport').classList.toggle('collapsed',innerWidth<701);$('#passport-toggle').setAttribute('aria-expanded',String(innerWidth>=701));$('#passport-toggle b').textContent=innerWidth<701?'+':'−';
  $('#end-visit-button').hidden=false;cameraPosition.set(player.x,35,player.z+28);syncView();syncController();updateHud();notify('Welcome to Palm Coast. Eight experiences, no rush. The island is yours.',4);beep(560);
}
function finish(){
  if(hasShownResults)return;hasShownResults=true;clearInput();boat=null;activity=null;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  $('#results').hidden=false;$('#interaction').hidden=true;$('#crosshair').hidden=true;
  $('#final-stamps').textContent=session.visits.length+' / 8';$('#final-score').textContent=String(session.score).padStart(3,'0');
  $('#end-visit-button').hidden=true;$('#result-message').textContent=session.visits.length===8?'Passport complete! You discovered every corner of Palm Coast Resort in '+formatTime(session.elapsed)+'.':'A little island time well spent. You explored '+session.visits.length+' resort experiences over '+formatTime(session.elapsed)+'. Come back whenever you like.';
  $('#result-stamps').replaceChildren();for(const point of world.interactionPoints){const badge=document.createElement('span');badge.className=session.visits.includes(point.id)?'earned':'';badge.textContent=(badge.className?'✓ ':'')+point.label;$('#result-stamps').append(badge);}
  $('#replay-button').focus();syncController();updateHud();beep(360,.4);
}
function returnToLand(){
  const point=boat?world.interactionPoints.find(p=>p.id===boat.id):world.interactionPoints.find(p=>p.id==='snorkel');
  if(boat){boat.root.position.x=boat.home.x;boat.root.position.z=boat.home.z;boat.root.rotation.y=boat.home.heading;}
  player.x=point.x;player.z=point.z;yaw=Math.atan2(point.x,point.z);boat=null;activity=null;clearInput();notify('Back on island time. Pick your next stop.',2);
}
function interact(){
  if(!canControl())return;
  if(boat||activity==='snorkel'){returnToLand();return;}
  if(!nearby){notify('Follow the paths or set a passport waypoint to find a resort stop.',2);return;}
  const point=nearby;stamp(point.id);
  if(point.type==='bar'){$('#bar-title').textContent=point.label;$('#bar-status').textContent='No drink needed — your passport is already stamped.';clearInput();$('#bar-dialog').showModal();return;}
  if(point.type==='boat'){
    boat=world.boats.find(b=>b.id===point.id);player.x=boat.root.position.x;player.z=boat.root.position.z;
    boatAngle=Math.atan2(player.z/43,player.x/55);yaw=Math.PI+boat.home.heading;activity=null;notify(boat.kind==='pontoon'?'Pontoon cruise underway · enjoy the coast · E returns to dock':'Paddle with WASD / arrows or the left stick · E returns to dock',4);return;
  }
  if(point.type==='ball'){
    const item=[...world.balls].sort((a,b)=>a.root.position.distanceTo(avatar.position)-b.root.position.distanceTo(avatar.position))[0];
    if(item){const dx=item.root.position.x-player.x,dz=item.root.position.z-player.z,len=Math.hypot(dx,dz)||1;ballVelocities.set(item.root,{x:dx/len*7,z:dz/len*7,y:3.2,floor:item.root.userData.restY});beep(240);}return;
  }
  if(point.type==='snorkel'){activity='snorkel';activityUntil=visualTime+8;player.x=-30;player.z=-28;notify('Above the reef · spot the coral garden · E returns to the beach',4);return;}
  activity=point.type;activityUntil=visualTime+5;notify(point.type==='relax'?'A shady cabana, an ocean breeze. Stay a moment or keep exploring.':'The horizon goes on forever. Take your time and enjoy the view.',4);
}
function collision(x,z){return world.colliders.some(b=>x>b.minX-.28&&x<b.maxX+.28&&z>b.minZ-.28&&z<b.maxZ+.28);}
function movePlayer(dt){
  if(!canControl())return;
  let x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+stick.x;
  let z=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+stick.y;
  const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}
  if(activity==='snorkel'){if(visualTime>activityUntil)returnToLand();return;}
  if(boat?.kind==='pontoon'){
    boatAngle-=dt*.17;const desiredX=55*Math.cos(boatAngle),desiredZ=43*Math.sin(boatAngle),dx=desiredX-player.x,dz=desiredZ-player.z,distance=Math.hypot(dx,dz),step=Math.min(distance,dt*8.5);
    if(distance>0){player.x+=dx/distance*step;player.z+=dz/distance*step;player.heading=Math.atan2(dx,dz);}boat.root.position.x=player.x;boat.root.position.z=player.z;boat.root.rotation.y=player.heading;return;
  }
  if(view==='first-person'&&!overview){const originalX=x;x=x*Math.cos(yaw)+z*Math.sin(yaw);z=-originalX*Math.sin(yaw)+z*Math.cos(yaw);}
  if(length>.03){activity=null;const speed=boat?10.5:11.5;const strength=islandEffects(session).strength;
    if(!reduced){x+=Math.sin(visualTime*1.8)*strength*.10;z+=Math.cos(visualTime*1.3)*strength*.07;}
    const nx=player.x+x*speed*dt,nz=player.z+z*speed*dt;
    if(boat){if(!world.isLand(nx,player.z)&&Math.abs(nx)<61)player.x=nx;if(!world.isLand(player.x,nz)&&Math.abs(nz)<50)player.z=nz;}
    else{if(world.isLand(nx,player.z)&&!collision(nx,player.z))player.x=nx;if(world.isLand(player.x,nz)&&!collision(player.x,nz))player.z=nz;}
    player.heading=Math.atan2(x,z);if(visualTime-lastFootstep>.5){lastFootstep=visualTime;beep(boat?180:120,.04);}
  }
  if(boat){boat.root.position.x=player.x;boat.root.position.z=player.z;if(length>.03)boat.root.rotation.y=player.heading;
    for(const buoy of buoys)if(!buoy.hit&&Math.hypot(player.x-buoy.x,player.z-buoy.z)<2.8){buoy.hit=true;buoy.root.children[0].material.color.set('#ffffff');beep(850);notify('Lagoon buoy '+(buoys.filter(b=>b.hit).length)+' / 3 reached!',2);}
  }
}
function updateInteraction(){
  if(!running())return;nearby=null;let distance=Infinity;
  for(const point of world.interactionPoints){const d=Math.hypot(point.x-player.x,point.z-player.z);if(d<point.radius&&d<distance){nearby=point;distance=d;}}
  const target=nearby||waypoint;const label=$('#interaction-label'),hint=$('#interaction-hint'),button=$('#interact-button');
  if(boat||activity==='snorkel'){$('#interaction-type').textContent=boat?'ON THE WATER':'UNDER THE TROPICAL SUN';label.textContent=boat?boat.kind==='pontoon'?'Pontoon island cruise':'Paddling the lagoon':'Snorkeling the reef';hint.textContent=boat?.kind==='pontoon'?'A scenic circuit of Palm Coast Resort. Sit back and enjoy.':boat?'WASD / arrows to paddle. Follow the glowing green buoys.':'Coral, clear water, and a moment of calm.';button.innerHTML='Return <kbd>E</kbd>';button.disabled=false;return;}
  $('#interaction-type').textContent=nearby?descriptions[nearby.id][1].toUpperCase():waypoint?'YOUR NEXT ISLAND STOP':'EXPLORE THE ISLAND';
  label.textContent=target?target.label+(nearby?'':' · '+Math.round(Math.hypot(target.x-player.x,target.z-player.z))+' m'):'Find your next adventure';
  hint.textContent=nearby?descriptions[nearby.id][2]:waypoint?'Follow the glowing marker. WASD / arrows to move.':'Walk the paths. Select a passport stop to set a waypoint.';
  button.innerHTML=(nearby?descriptions[nearby.id][3]:'Explore')+' <kbd>E</kbd>';button.disabled=!nearby;
}
function updateHud(){
  $('#time-left').textContent=formatTime(Math.floor(session.elapsed));$('#time-fill').style.width=(session.visits.length/8*100)+'%';
  $('#stamp-count').textContent=session.visits.length;$('#passport-progress').textContent=session.visits.length+' / 8';$('#score').textContent=String(session.score).padStart(3,'0')+' PTS';
  for(const button of document.querySelectorAll('.destination')){const visited=session.visits.includes(button.dataset.destination);button.classList.toggle('visited',visited);button.classList.toggle('target',waypoint?.id===button.dataset.destination);button.querySelector('.check').textContent=visited?'✓':'↗';}
  const effects=islandEffects(session);$('#buzz-label').textContent=effects.label;$('#buzz-fill').style.width=effects.strength*100+'%';$('#pending-fill').style.width=Math.min(1-effects.strength,session.stomach)*100+'%';
  const drinks=session.activeDrinks||[];$('#buzz-description').textContent=session.stomach>.03?'Drink digesting · each buzz fades in 2 minutes.':effects.strength>.01?'Stacked drinks fade on their own timers.':'Clear skies. Optional drinks at either bar.';
  $('#buzz-timers').hidden=drinks.length===0;$('#active-drink-count').textContent=drinks.length+' active '+(drinks.length===1?'drink':'drinks');$('#sober-time').textContent='Clear in '+formatTime(session.buzzRemaining||0);
  $('#drink-timers').hidden=drinks.length===0;const drinkList=$('#active-drink-list');drinkList.replaceChildren();for(const drink of drinks){const row=document.createElement('div');row.className='drink-timer';const label=document.createElement('span');label.textContent=(drink.kind==='beer'?'Island beer':'Sunset cocktail')+' '+drink.id;const time=document.createElement('b');time.textContent=formatTime(drink.remaining);const track=document.createElement('i');track.style.setProperty('--remaining',Math.max(0,drink.remaining/120*100)+'%');row.append(label,time,track);drinkList.append(row);}
  if(waypoint)$('#waypoint-label').textContent=waypoint.label+' · '+Math.round(Math.hypot(waypoint.x-player.x,waypoint.z-player.z))+' m';else $('#waypoint-label').textContent='Select a passport stop to set a waypoint.';
  updateInteraction();drawMap();
}
function drawMap(){
  if(!mapCtx)return;const c=mapCtx,w=mapCanvas.width,h=mapCanvas.height,px=x=>w/2+x*2.8,pz=z=>h/2+z*2.8;c.clearRect(0,0,w,h);c.fillStyle='#8fcfc4';c.beginPath();c.roundRect(0,8,w,h-16,18);c.fill();
  c.beginPath();for(let i=0;i<=120;i++){const a=i/120*Math.PI*2,r=world.shoreRadius(a);const x=px(Math.cos(a)*45*r),z=pz(Math.sin(a)*34*r);i?c.lineTo(x,z):c.moveTo(x,z);}c.closePath();c.fillStyle='#e9d6a5';c.fill();c.save();c.translate(w/2,h/2);c.scale(.77,.76);c.translate(-w/2,-h/2);c.fillStyle='#97b882';c.fill();c.restore();
  c.strokeStyle='#f4ead0';c.lineWidth=7;c.beginPath();c.moveTo(px(0),pz(24));c.lineTo(px(0),pz(-25));c.moveTo(px(-25),pz(7));c.lineTo(px(-15),pz(9));c.lineTo(px(0),pz(9));c.lineTo(px(43),pz(10));c.moveTo(px(0),pz(-8));c.lineTo(px(23),pz(-8));c.moveTo(px(23),pz(10));c.lineTo(px(43),pz(20));c.stroke();
  for(const point of world.interactionPoints){c.beginPath();c.arc(px(point.x),pz(point.z),waypoint?.id===point.id?8:6,0,Math.PI*2);c.fillStyle=session.visits.includes(point.id)?'#4f9567':point.type==='bar'?'#e39a69':'#fff5da';c.fill();c.strokeStyle=waypoint?.id===point.id?'#d6ff73':'#527c69';c.lineWidth=2;c.stroke();}
  c.save();c.translate(px(player.x),pz(player.z));c.rotate(Math.PI-player.heading);c.fillStyle='#133e38';c.strokeStyle='#efffc3';c.lineWidth=2;c.beginPath();c.moveTo(0,-9);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fill();c.stroke();c.restore();
}
function updateCamera(dt){
  const effects=islandEffects(session),sway=reduced?0:effects.sway;let ground=boat?.65:activity==='snorkel'?0:world.groundHeight(player.x,player.z);
  avatar.position.set(player.x,ground,player.z);avatar.rotation.y=player.heading;avatar.visible=(overview||view!=='first-person')&&activity!=='snorkel';
  const moving=keys.size>0||Math.hypot(stick.x,stick.y)>.1;for(const [i,leg] of avatar.userData.legs.entries())leg.rotation.x=moving&&!boat?Math.sin(visualTime*10+i*Math.PI)*.35:0;
  if(!running()&&session.status==='ready'){
    camera.position.set(67,72,91);camera.lookAt(-8,0,0);return;
  }
  if(overview){const aspect=innerWidth/innerHeight;const distance=aspect<1?105/aspect:105;cameraPosition.lerp(cameraTarget.set(38,distance*.8,distance*.75),1-Math.exp(-dt*4));camera.position.copy(cameraPosition);camera.lookAt(0,0,0);return;}
  if(view==='first-person'){
    cameraPosition.set(player.x,ground+(activity==='snorkel'?.65:1.75),player.z);camera.position.copy(cameraPosition);
    const lookYaw=(boat?.kind==='pontoon'?Math.PI+player.heading:yaw)+Math.sin(visualTime*1.3)*sway;
    cameraLook.set(player.x-Math.sin(lookYaw)*10,cameraPosition.y+Math.sin(pitch+sway*Math.cos(visualTime*.9))*10,player.z-Math.cos(lookYaw)*10);camera.lookAt(cameraLook);camera.rotateZ(Math.sin(visualTime*.95)*sway*.65);
  }else{
    cameraTarget.set(player.x+(activity==='snorkel'?8:0),ground+zoom,player.z+zoom*.82);
    cameraPosition.lerp(cameraTarget,1-Math.exp(-dt*5));camera.position.copy(cameraPosition);camera.lookAt(player.x,ground,player.z);camera.rotateZ(Math.sin(visualTime)*sway*.4);
  }
}
function animateBalls(dt){for(const [root,velocity]of ballVelocities){const nx=root.position.x+velocity.x*dt,nz=root.position.z+velocity.z*dt;if(world.isLand(nx,nz)){root.position.x=nx;root.position.z=nz;}else{velocity.x*=-.5;velocity.z*=-.5;}velocity.y-=9*dt;root.position.y+=velocity.y*dt;if(root.position.y<velocity.floor){root.position.y=velocity.floor;velocity.y=Math.abs(velocity.y)*.45;}velocity.x*=Math.exp(-1.2*dt);velocity.z*=Math.exp(-1.2*dt);root.rotation.x+=velocity.z*dt;root.rotation.z-=velocity.x*dt;if(Math.hypot(velocity.x,velocity.z)<.06&&Math.abs(velocity.y)<.1)ballVelocities.delete(root);}}
function frame(now){
  const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.05,elapsed);last=now;visualTime+=dt;
  if(running()){syncSessionTime(now);let movementTime=Math.min(.25,elapsed);while(movementTime>0){const step=Math.min(.025,movementTime);movePlayer(step);movementTime-=step;}}
  animateTropicalIslandWorld(world,visualTime,dt);animateBalls(dt);updateCamera(dt);
  for(const buoy of buoys){buoy.root.rotation.y=visualTime*.3;buoy.root.position.y=1.4+Math.sin(visualTime*1.5+buoy.index)*.14;}
  if(now-lastHud>100){updateHud();lastHud=now;}
  if(now>toastUntil)$('#toast').classList.remove('show');
  const strength=reduced?0:islandEffects(session).strength;$('#goggle-tint').style.opacity=strength;
  if(strength>.01){postMaterial.uniforms.strength.value=strength;postMaterial.uniforms.time.value=visualTime;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCamera);}else renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
function bindControls(){
  $('#start-button').onclick=start;$('#replay-button').onclick=start;$('#interact-button').onclick=interact;$('#view-button').onclick=setCameraMode;
  $('#map-overview-button').onclick=toggleOverview;
  $('#sound-button').onclick=()=>{sound=!sound;$('#sound-button').textContent=sound?'Sound on':'Sound off';$('#sound-button').setAttribute('aria-pressed',String(sound));beep(580);};
  $('#settings-button').onclick=()=>{clearInput();$('#settings-dialog').showModal();};
  $('#end-visit-button').onclick=()=>{syncSessionTime();finishIslandSession(session);finish();};
  $('#reduce-effects').checked=reduced;$('#reduce-effects').onchange=e=>{reduced=e.target.checked;};
  $('#show-controller').checked=showController;$('#show-controller').onchange=e=>{showController=e.target.checked;syncController();};
  $('#passport-toggle').onclick=()=>{const collapsed=$('#passport').classList.toggle('collapsed');$('#passport-toggle').setAttribute('aria-expanded',String(!collapsed));$('#passport-toggle b').textContent=collapsed?'+':'−';};
  for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();
  for(const button of document.querySelectorAll('[data-drink]'))button.onclick=()=>{syncSessionTime();const result=consumeIslandDrink(session,button.dataset.drink);$('#bar-status').textContent=result.ok?result.dose>0?'Cheers. This drink has its own two-minute buzz. More drinks stack.':'Refreshing. Enjoy the island!':result.reason;if(result.ok){beep(660);updateHud();}};
  document.addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,select')||event.ctrlKey||event.metaKey||event.altKey)return;
    const key=event.key.toLowerCase();if(menuOpen()||(key===' '&&event.target.closest('button,a,[role="button"]')))return;
    if(key==='v'&&!event.repeat){setCameraMode();return;}
    if(key==='m'&&!event.repeat){toggleOverview();return;}
    if(!running())return;
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','e'].includes(key)){event.preventDefault();if(['e',' '].includes(key)){if(!event.repeat)interact();}else keys.add(key);}
    if(key==='escape'){clearInput();$('#settings-dialog').showModal();}
  });
  document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);
  renderer.domElement.addEventListener('pointerdown',event=>{if(!canControl()||event.button>0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY};renderer.domElement.setPointerCapture(event.pointerId);});
  renderer.domElement.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;if(view==='first-person'){yaw-=dx*.004;pitch=Math.max(-1.1,Math.min(.85,pitch-dy*.004));}else zoom=Math.max(18,Math.min(48,zoom+dy*.05));});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,()=>{drag=null;});
  renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(18,Math.min(48,zoom+event.deltaY*.015));},{passive:false});
  controller=mountRadToxController({enabled:canControl,visible:()=>showController&&running(),onMove:axes=>{stick={...axes};},onLook:(axes,dt)=>{if(view==='first-person'){yaw-=axes.x*dt*2;pitch=Math.max(-1.1,Math.min(.85,pitch-axes.y*dt));}else zoom=Math.max(18,Math.min(48,zoom+axes.y*dt*15));},onView:setCameraMode,onShoot:()=>{},onSettings:()=>$('#settings-button').click(),onMatch:()=>$('#passport-toggle').click(),onStats:()=>$('#settings-button').click(),onExit:()=>location.assign('index.html#world-map'),buttons:[{label:'Interact · E',tap:interact}]});
  const supplyMapId=new URLSearchParams(location.search).get('environment')||'tropical-island';
  const worldSupplyUI=mountWorldSupplyUI({stage:$('#settings-dialog'),inventory:new SharedGameInventory({getMapId:()=>supplyMapId}),showLabel:true,onOpen:clearInput,onClose:clearInput,announce:notify});
  worldSupplyUI.update(null,null,{id:supplyMapId,name:'Palm Coast Resort'});
  const labels=controller.root.querySelectorAll('.thumbstick-label');labels[0].textContent='MOVE / PADDLE';labels[1].textContent='LOOK / VIEW';
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);target.setSize(innerWidth,innerHeight);postMaterial.uniforms.resolution.value.set(innerWidth,innerHeight);});
}
try{
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;$('#world').append(renderer.domElement);
  scene=new T.Scene();scene.background=new T.Color('#98d8cf');scene.fog=new T.Fog('#b5e0d5',110,230);camera=new T.PerspectiveCamera(48,innerWidth/innerHeight,.1,350);
  scene.add(new T.HemisphereLight('#f1fff0','#3e7275',1.5));const sun=new T.DirectionalLight('#fff0ce',2.8);sun.position.set(-40,65,25);scene.add(sun);
  world=createTropicalIslandWorld();for(const item of world.balls)item.root.userData.restY=item.root.position.y;scene.add(world.root);avatar=makeAvatar();scene.add(avatar);createMarkers();createPostProcess();makePassport();bindControls();syncView();
  $('#start-button').disabled=false;$('#start-button').innerHTML='Escape to the island <span class="direction-arrow" aria-hidden="true"></span>';requestAnimationFrame(frame);
  // A read-only integration surface for automated map and accessibility checks.
  window.islandAdventure=Object.freeze({getState:()=>({status:session.status,elapsed:session.elapsed,remaining:session.remaining,visits:[...session.visits],score:session.score,intoxication:session.intoxication,stomach:session.stomach,activeDrinks:(session.activeDrinks||[]).map(drink=>({...drink})),buzzRemaining:session.buzzRemaining||0,nextExpiryIn:session.nextExpiryIn||0,player:{...player},boat:boat?.id||null,view,overview,effects:islandEffects(session)}),destinations:world.interactionPoints.map(p=>({...p})),ready:true});
}catch(error){console.error('Island startup:',error);$('#start-button').disabled=true;$('#load-error').hidden=false;$('#load-error').textContent='The island could not start. This 3D map needs a browser with WebGL enabled. Reload the page to try again.';}
