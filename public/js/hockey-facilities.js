import * as THREE from '../vendor/three/three.module.min.js';
const scoreboardSurfaces=new WeakMap(),arenaScorePanels=new WeakMap();
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.72});
function part(root,name,size,pos,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color));mesh.name=name;mesh.position.set(...pos);root.add(mesh);return mesh;}
function glass(root,name,size,pos){const mesh=part(root,name,size,pos,'#a8dbe8');mesh.material.transparent=true;mesh.material.opacity=.22;return mesh;}
function sign(root,text,pos,width=5,rotation=0){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width*.2),new THREE.MeshBasicMaterial({color:'#b8edff',side:THREE.DoubleSide}));
 if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;const c=canvas.getContext('2d');c.fillStyle='#0c1d2e';c.fillRect(0,0,768,160);c.fillStyle='#b8edff';c.textAlign='center';c.font='bold 46px sans-serif';c.fillText(text,384,100,730);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;mesh.material.map=texture;mesh.material.color.set('#ffffff');scoreboardSurfaces.set(mesh,{canvas,context:c,texture});}
 mesh.position.set(...pos);mesh.rotation.y=rotation;mesh.name=text;root.add(mesh);return mesh;
}
function seats(root,poses){
 const base=new THREE.InstancedMesh(new THREE.BoxGeometry(.46,.12,.45),material('#276699'),poses.length),backs=new THREE.InstancedMesh(new THREE.BoxGeometry(.46,.55,.1),material('#2873a9'),poses.length),dummy=new THREE.Object3D();base.name='SPECTATOR_SEAT_CUSHIONS';backs.name='SPECTATOR_SEAT_BACKS';
 poses.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.rotation;dummy.updateMatrix();base.setMatrixAt(i,dummy.matrix);dummy.position.y+=.29;dummy.position.x-=Math.sin(p.rotation)*.2;dummy.position.z-=Math.cos(p.rotation)*.2;dummy.updateMatrix();backs.setMatrixAt(i,dummy.matrix);const color=new THREE.Color(p.tier===0?'#276699':'#514889');if(i%7===0)color.set('#6c93af');base.setColorAt(i,color);backs.setColorAt(i,color);});
 base.instanceMatrix.needsUpdate=backs.instanceMatrix.needsUpdate=true;root.add(base,backs);root.userData.spectatorSeatCount=poses.length;
}
export function addHockeyFacilities(root){
 const facilities=new THREE.Group();facilities.name='HOCKEY_ARENA_FACILITIES';const poses=[];
 for(const side of [-1,1])for(const tier of [0,1]){
  const rows=tier===0?6:5;
  for(let row=0;row<rows;row++){
   const z=side*(18+(tier?10:0)+row*1.15),y=1+(tier?6:0)+row*.7;
   part(facilities,`SPECTATOR_${tier?'UPPER':'LOWER'}_TIER_${side}_${row}`,[68,.4,1.2],[0,y-.35,z],'#243648');
   for(let seat=0;seat<96;seat++){if(seat%24<2)continue;poses.push({x:-32+seat*.68,y,z,rotation:side<0?0:Math.PI,tier});}
  }
  part(facilities,'TIER_GUARD_RAIL',[68,1,.07],[0,tier?6.2:.8,side*(tier?27.2:17.2)],'#6e859b');
  sign(facilities,tier?'UPPER BOWL · 200 LEVEL':'LOWER BOWL · 100 LEVEL',[0,tier?10.4:4.7,side*(tier?33.5:23.5)],10,side<0?0:Math.PI);
 }
 for(const side of [-1,1])for(let row=0;row<6;row++){
  const x=side*(35+row*1.15),y=1+row*.7;part(facilities,'END_STAND_TIER',[1.2,.4,31],[x,y-.35,0],'#243648');
  for(let seat=0;seat<40;seat++){if(seat%20<2)continue;poses.push({x,y,z:-14+seat*.72,rotation:side<0?Math.PI/2:-Math.PI/2,tier:0});}
 }
 seats(facilities,poses);
 // A concourse and six entry tunnels surround the seating bowl.
 for(const side of [-1,1]){
  part(facilities,'UPPER_CONCOURSE',[90,.35,3],[0,7,side*26],'#1c2b3d');
  for(const x of [-25,0,25]){part(facilities,'SPECTATOR_ACCESS_TUNNEL',[3,3,4],[x,1.2,side*25.5],'#101b29');sign(facilities,'SECTION '+(side<0?'1':'2')+(x+25)/25,[x,3,side*23.4],2.8,side<0?0:Math.PI);}
 }
 for(const [team,x]of [[0,-10],[1,10]]){
  const g=new THREE.Group();g.name=team===0?'HOME_PLAYER_BENCH':'AWAY_PLAYER_BENCH';g.position.set(x,0,-14.65);
  part(g,'BENCH_PLATFORM',[13,.2,2.4],[0,.1,0],'#172b3e');part(g,'PLAYER_BENCH_SEATING',[11,.18,.6],[0,.52,-.35],team===0?'#237ad4':'#dc3c56');part(g,'BENCH_BACKREST',[11,.7,.12],[0,.9,-.62],'#2b4355');
  for(const end of [-1,1])glass(g,'BENCH_SIDE_PARTITION',[.08,2.3,2.4],[end*6.5,1.15,0]);glass(g,'BENCH_BACK_GLASS',[13,2.3,.06],[0,1.15,-1.2]);
  const gate=part(g,'BENCH_ICE_GATE',[1.2,1.07,.08],[team===0?5.7:-5.7,.535,1.2],'#e5f2fa');gate.userData.benchGate=team;
  sign(g,team===0?'HOME BENCH':'VISITORS BENCH',[0,2.1,.1],5);for(let slot=0;slot<8;slot++){part(g,'WATER_BOTTLE',[.08,.22,.08],[-4+slot,1,-.4],'#ef672c');part(g,'SPARE_STICK',[.035,1.5,.035],[-4+slot,.9,-.95],'#c9b696');}
  for(let seat=0;seat<14;seat++){const sx=-4.8+seat*.74;part(g,'RESERVE_SKATER_JERSEY',[.4,.5,.28],[sx,1,-.3],team===0?'#237ad4':'#dc3c56');const head=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),material('#233142'));head.position.set(sx,1.4,-.3);g.add(head);part(g,'RESERVE_SKATER_LEGS',[.3,.45,.25],[sx,.45,.05],'#182939');}
  facilities.add(g);
 }
 for(const [team,x]of [[0,-5],[1,5]]){
  const g=new THREE.Group();g.name=team===0?'HOME_PENALTY_BOX':'AWAY_PENALTY_BOX';g.position.set(x,0,14.8);
  part(g,'PENALTY_BOX_FLOOR',[4,.15,2.5],[0,.07,0],'#172b3e');part(g,'PENALTY_BENCH',[3,.2,.55],[0,.5,.7],'#a4b4c1');
  for(const side of [-1,1])glass(g,'PENALTY_BOX_PARTITION',[.07,2.3,2.5],[side*2,1.15,0]);glass(g,'PENALTY_BOX_BACK_GLASS',[4,2.3,.06],[0,1.15,1.25]);
  part(g,'PENALTY_BOX_GATE',[1,1.07,.08],[0,.535,-1.25],'#d4e9f5');sign(g,team===0?'HOME PENALTIES':'VISITOR PENALTIES',[0,2.2,0],3.5,Math.PI);facilities.add(g);
 }
 part(facilities,'OFFICIAL_SCORERS_TABLE',[4,1.1,1.5],[0,.55,15.1],'#344d63');sign(facilities,'OFFICIAL SCOREKEEPER',[0,1.9,14.2],3.8,Math.PI);
 for(const x of [-22,22]){part(facilities,'PLAYER_LOCKER_TUNNEL',[3,3,7],[x,1.2,-18.7],'#101b29');sign(facilities,'LOCKER ROOMS',[x,2.8,-15.1],3);}
 // Suspended four-sided scoreboard, truss and arena light banks.
 const scoreboard=new THREE.Group();scoreboard.name='CENTER_ICE_JUMBOTRON';scoreboard.position.set(0,13,0);part(scoreboard,'SCOREBOARD_BODY',[6,2,3.5],[0,0,0],'#101b29');
 const panels=[];for(const side of [-1,1])panels.push(sign(scoreboard,'MUZIKAZ ICE HOCKEY',[0,0,side*1.76],5.8,side<0?Math.PI:0));facilities.add(scoreboard);arenaScorePanels.set(facilities,panels);
 for(const x of [-23,23])for(const z of [-9,9]){part(facilities,'OVERHEAD_LIGHT_TRUSS',[8,.15,.15],[x,15,z],'#597184');const bank=part(facilities,'ARENA_LIGHT_BANK',[5,.12,1],[x,14.8,z],'#f5f9ff');bank.material.emissive=new THREE.Color('#aecede');bank.material.emissiveIntensity=.8;}
 root.add(facilities);root.userData.spectatorSeatCount=poses.length;return facilities;
}

export function updateHockeyScoreboard(arena,state){const facilities=arena.getObjectByName('HOCKEY_ARENA_FACILITIES');if(!facilities)return;const time=Math.max(0,Math.ceil(state.remaining)),tag=[...state.score,state.period,time,state.phase].join(':');if(facilities.userData.scoreTag===tag)return;facilities.userData.scoreTag=tag;for(const panel of arenaScorePanels.get(facilities)||[]){const surface=scoreboardSurfaces.get(panel);if(!surface)continue;const{context:c,texture}=surface;c.fillStyle='#081624';c.fillRect(0,0,768,160);c.textAlign='center';c.fillStyle='#e9f8ff';c.font='bold 56px monospace';c.fillText(`${state.score[0]}  —  ${state.score[1]}`,384,76);c.fillStyle='#b9ff38';c.font='30px monospace';c.fillText(`${state.phase==='shootout'?'SHOOTOUT':state.period>3?'OT':'P'+state.period}  ${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`,384,130);texture.needsUpdate=true;}}
