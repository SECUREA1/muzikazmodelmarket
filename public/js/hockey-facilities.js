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
// Shared component recipes keep custom arenas identical to the match arena.
function addSeatingSection(root,poses,{side=1,tier=0,end=false}={}){
 if(end){
  for(let row=0;row<6;row++){const x=side*(35+row*1.15),y=1+row*.7;part(root,'END_STAND_TIER',[1.2,.4,31],[x,y-.35,0],'#243648');for(let seat=0;seat<40;seat++){if(seat%20<2)continue;poses.push({x,y,z:-14+seat*.72,rotation:side<0?Math.PI/2:-Math.PI/2,tier:0});}}
  return;
 }
 const rows=tier===0?6:5;
 for(let row=0;row<rows;row++){
  const z=side*(18+(tier?10:0)+row*1.15),y=1+(tier?6:0)+row*.7;
  part(root,`SPECTATOR_${tier?'UPPER':'LOWER'}_TIER_${side}_${row}`,[68,.4,1.2],[0,y-.35,z],'#243648');
  for(let seat=0;seat<96;seat++){if(seat%24<2)continue;poses.push({x:-32+seat*.68,y,z,rotation:side<0?0:Math.PI,tier});}
 }
 part(root,'TIER_GUARD_RAIL',[68,1,.07],[0,tier?6.2:.8,side*(tier?27.2:17.2)],'#6e859b');
 sign(root,tier?'UPPER BOWL · 200 LEVEL':'LOWER BOWL · 100 LEVEL',[0,tier?10.4:4.7,side*(tier?33.5:23.5)],10,side<0?0:Math.PI);
}
function createPlayerBench(team=0){
 const g=new THREE.Group();g.name=team===0?'HOME_PLAYER_BENCH':'AWAY_PLAYER_BENCH';
 part(g,'BENCH_PLATFORM',[13,.2,2.4],[0,.1,0],'#172b3e');part(g,'PLAYER_BENCH_SEATING',[11,.18,.6],[0,.52,-.35],team===0?'#237ad4':'#dc3c56');part(g,'BENCH_BACKREST',[11,.7,.12],[0,.9,-.62],'#2b4355');
 for(const end of [-1,1])glass(g,'BENCH_SIDE_PARTITION',[.08,2.3,2.4],[end*6.5,1.15,0]);glass(g,'BENCH_BACK_GLASS',[13,2.3,.06],[0,1.15,-1.2]);
 const gate=part(g,'BENCH_ICE_GATE',[1.2,1.07,.08],[team===0?5.7:-5.7,.535,1.2],'#e5f2fa');gate.userData.benchGate=team;
 sign(g,team===0?'HOME BENCH':'VISITORS BENCH',[0,2.1,.1],5);for(let slot=0;slot<8;slot++){const bottle=createWaterBottle();bottle.position.set(-4+slot,.89,-.4);g.add(bottle);part(g,'SPARE_STICK',[.035,1.5,.035],[-4+slot,.9,-.95],'#c9b696');}
 for(let seat=0;seat<14;seat++){const sx=-4.8+seat*.74;part(g,'RESERVE_SKATER_JERSEY',[.4,.5,.28],[sx,1,-.3],team===0?'#237ad4':'#dc3c56');const head=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),material('#233142'));head.position.set(sx,1.4,-.3);g.add(head);part(g,'RESERVE_SKATER_LEGS',[.3,.45,.25],[sx,.45,.05],'#182939');}
 return g;
}
function createPenaltyBox(team=0){
 const g=new THREE.Group();g.name=team===0?'HOME_PENALTY_BOX':'AWAY_PENALTY_BOX';
 part(g,'PENALTY_BOX_FLOOR',[4,.15,2.5],[0,.07,0],'#172b3e');part(g,'PENALTY_BENCH',[3,.2,.55],[0,.5,.7],'#a4b4c1');
 for(const side of [-1,1])glass(g,'PENALTY_BOX_PARTITION',[.07,2.3,2.5],[side*2,1.15,0]);glass(g,'PENALTY_BOX_BACK_GLASS',[4,2.3,.06],[0,1.15,1.25]);
 part(g,'PENALTY_BOX_GATE',[1,1.07,.08],[0,.535,-1.25],'#d4e9f5');sign(g,team===0?'HOME PENALTIES':'VISITOR PENALTIES',[0,2.2,0],3.5,Math.PI);return g;
}
function createScorersTable(){const g=new THREE.Group();g.name='OFFICIAL_SCORERS_TABLE';part(g,'SCORERS_DESK',[4,1.1,1.5],[0,.55,0],'#344d63');sign(g,'OFFICIAL SCOREKEEPER',[0,1.9,-.9],3.8,Math.PI);return g;}
function createLockerTunnel(){const g=new THREE.Group();g.name='PLAYER_LOCKER_TUNNEL';part(g,'LOCKER_TUNNEL_SHELL',[3,3,7],[0,1.2,0],'#101b29');sign(g,'LOCKER ROOMS',[0,2.8,3.6],3);return g;}
function createConcourse(){const g=new THREE.Group();g.name='UPPER_CONCOURSE';part(g,'CONCOURSE_FLOOR',[90,.35,3],[0,.175,0],'#1c2b3d');return g;}
function createEntryTunnel(label='ARENA ENTRANCE'){const g=new THREE.Group();g.name='SPECTATOR_ACCESS_TUNNEL';part(g,'ENTRY_TUNNEL_SHELL',[3,3,4],[0,1.5,0],'#101b29');sign(g,label,[0,3.3,2.1],2.8);return g;}
function createScoreboard(){
 const g=new THREE.Group();g.name='CENTER_ICE_JUMBOTRON';part(g,'SCOREBOARD_BODY',[6,2,3.5],[0,0,0],'#101b29');
 const panels=[];for(const side of [-1,1])panels.push(sign(g,'MUZIKAZ ICE HOCKEY',[0,0,side*1.76],5.8,side<0?Math.PI:0));arenaScorePanels.set(g,panels);return g;
}
function createLightBank(){const g=new THREE.Group();g.name='HOCKEY_OVERHEAD_LIGHT_BANK';part(g,'OVERHEAD_LIGHT_TRUSS',[8,.15,.15],[0,.26,0],'#597184');const bank=part(g,'ARENA_LIGHT_BANK',[5,.12,1],[0,.06,0],'#f5f9ff');bank.material.emissive=new THREE.Color('#aecede');bank.material.emissiveIntensity=.8;return g;}
function createWaterBottle(){const g=new THREE.Group();g.name='WATER_BOTTLE';part(g,'WATER_BOTTLE_BODY',[.08,.22,.08],[0,.11,0],'#ef672c');return g;}
function groundedComponent(component){const bounds=new THREE.Box3().setFromObject(component),center=bounds.getCenter(new THREE.Vector3()),root=new THREE.Group();root.name=component.name;component.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));root.add(component);root.userData.spectatorSeatCount=component.userData.spectatorSeatCount||0;return root;}
export function createHockeyFacility(id){
 let g;
 if(id==='hockey-home-bench'||id==='hockey-away-bench')g=createPlayerBench(id==='hockey-home-bench'?0:1);
 else if(id==='hockey-home-penalty-box'||id==='hockey-away-penalty-box')g=createPenaltyBox(id==='hockey-home-penalty-box'?0:1);
 else if(id==='hockey-scorers-table')g=createScorersTable();
 else if(id==='hockey-locker-tunnel')g=createLockerTunnel();
 else if(id==='hockey-concourse')g=createConcourse();
 else if(id==='hockey-entry-tunnel')g=createEntryTunnel();
 else if(id==='hockey-scoreboard')g=createScoreboard();
 else if(id==='hockey-light-bank')g=createLightBank();
 else if(id==='hockey-water-bottle')g=createWaterBottle();
 else if(id==='hockey-seat'){g=new THREE.Group();g.name='HOCKEY_SPECTATOR_SEAT';seats(g,[{x:0,y:0,z:0,rotation:0,tier:0}]);}
 else if(['hockey-seating-section','hockey-upper-seating-section','hockey-end-seating-section'].includes(id)){g=new THREE.Group();g.name='HOCKEY_SPECTATOR_SECTION';const poses=[];addSeatingSection(g,poses,{tier:id==='hockey-upper-seating-section'?1:0,end:id==='hockey-end-seating-section'});seats(g,poses);}
 else return null;
 return groundedComponent(g);
}
export function addHockeyFacilities(root){
 const facilities=new THREE.Group();facilities.name='HOCKEY_ARENA_FACILITIES';const poses=[];
 for(const side of [-1,1]){for(const tier of [0,1])addSeatingSection(facilities,poses,{side,tier});addSeatingSection(facilities,poses,{side,end:true});}
 seats(facilities,poses);
 // A concourse and six entry tunnels surround the seating bowl.
 for(const side of [-1,1]){
  const concourse=createConcourse();concourse.position.set(0,6.825,side*26);facilities.add(concourse);
  for(const x of [-25,0,25]){const tunnel=createEntryTunnel('SECTION '+(side<0?'1':'2')+(x+25)/25);tunnel.position.set(x,-.3,side*25.5);if(side>0)tunnel.rotation.y=Math.PI;facilities.add(tunnel);}
 }
 for(const [team,x]of [[0,-10],[1,10]]){const bench=createPlayerBench(team);bench.position.set(x,0,-14.65);facilities.add(bench);}
 for(const [team,x]of [[0,-5],[1,5]]){const box=createPenaltyBox(team);box.position.set(x,0,14.8);facilities.add(box);}
 const table=createScorersTable();table.position.set(0,0,15.1);facilities.add(table);
 for(const x of [-22,22]){const tunnel=createLockerTunnel();tunnel.position.set(x,0,-18.7);facilities.add(tunnel);}
 const scoreboard=createScoreboard();scoreboard.position.set(0,13,0);facilities.add(scoreboard);arenaScorePanels.set(facilities,arenaScorePanels.get(scoreboard));
 for(const x of [-23,23])for(const z of [-9,9]){const bank=createLightBank();bank.position.set(x,14.74,z);facilities.add(bank);}
 root.add(facilities);root.userData.spectatorSeatCount=poses.length;return facilities;
}

export function updateHockeyScoreboard(arena,state){const facilities=arena.getObjectByName('HOCKEY_ARENA_FACILITIES');if(!facilities)return;const time=Math.max(0,Math.ceil(state.remaining)),tag=[...state.score,state.period,time,state.phase].join(':');if(facilities.userData.scoreTag===tag)return;facilities.userData.scoreTag=tag;for(const panel of arenaScorePanels.get(facilities)||[]){const surface=scoreboardSurfaces.get(panel);if(!surface)continue;const{context:c,texture}=surface;c.fillStyle='#081624';c.fillRect(0,0,768,160);c.textAlign='center';c.fillStyle='#e9f8ff';c.font='bold 56px monospace';c.fillText(`${state.score[0]}  —  ${state.score[1]}`,384,76);c.fillStyle='#b9ff38';c.font='30px monospace';c.fillText(`${state.phase==='shootout'?'SHOOTOUT':state.period>3?'OT':'P'+state.period}  ${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`,384,130);texture.needsUpdate=true;}}
