import * as T from '../../vendor/three/three.module.min.js';

// This native interior uses the same metre coordinates as casino-world.mjs.
// Animated details are visual only; the durable game result belongs to the server.
export function createCasinoLand(environment={}) {
 const root=new T.Group();root.name='MUZIKAZ_CASINO_INTERIOR';
 root.userData={proceduralLand:true,layout:'casino',cleanSportsWorld:true,streetHeightAt:()=>0};
 const palette={wine:'#36112f',velvet:'#6f193e',ink:'#101a24',gold:'#cfa85e',lightGold:'#eed598',felt:'#135e51',marble:'#eadfca',walnut:'#362228',chrome:'#aab9c6'};
 const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.7,metalness:.05,...extra});
 const gold=mat(palette.gold,{metalness:.75,roughness:.28}),dark=mat(palette.ink),wood=mat(palette.walnut),felt=mat(palette.felt),velvet=mat(palette.velvet),marble=mat(palette.marble,{roughness:.22,metalness:.12}),steel=mat(palette.chrome,{metalness:.8,roughness:.32});
 const glow=mat('#ffe2a8',{emissive:'#ffcf79',emissiveIntensity:.9}),cyan=mat('#73ede4',{emissive:'#36cabb',emissiveIntensity:.65}),magenta=mat('#e95ca8',{emissive:'#c33a8b',emissiveIntensity:.7});
 const animations=[],stations=new Map(),recentPlays=new Map(),slotScreens=new Map(),diceMeshes=[];
 function mesh(parent,geometry,material,name,x=0,y=0,z=0,solid=true){const value=new T.Mesh(geometry,material);value.name=name;value.position.set(x,y,z);value.castShadow=solid;value.receiveShadow=true;if(!solid)value.userData.collisionDisabled=true;parent.add(value);return value;}
 const box=(parent,name,x,y,z,w,h,d,material,solid=true)=>mesh(parent,new T.BoxGeometry(w,h,d),material,name,x,y,z,solid);
 const cylinder=(parent,name,x,y,z,r,h,material,segments=32,solid=true)=>mesh(parent,new T.CylinderGeometry(r,r,h,segments),material,name,x,y,z,solid);
 function canvasTexture(width,height,paint){if(typeof document==='undefined')return null;const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');paint(ctx,width,height);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;}
 function sign(parent,text,x,y,z,w=5,h=.7,color='#f2ddb0',rotation=0,sub=''){
  const texture=canvasTexture(1024,192,(ctx,W,H)=>{ctx.fillStyle='#101823';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#b48c4c';ctx.lineWidth=5;ctx.strokeRect(7,7,W-14,H-14);ctx.textAlign='center';ctx.fillStyle=color;ctx.font='600 '+(sub?62:76)+'px Georgia,serif';ctx.fillText(text,W/2,sub?83:119);if(sub){ctx.font='24px system-ui';ctx.fillStyle='#b8c6c2';ctx.fillText(sub,W/2,143);}});
  const material=new T.MeshBasicMaterial({color:texture?'#ffffff':color,map:texture});
  const label=mesh(parent,new T.PlaneGeometry(w,h),material,'CASINO_SIGN_'+text,x,y,z,false);label.rotation.y=rotation;return label;
 }
 function floorTexture(){const texture=canvasTexture(512,512,(ctx,W,H)=>{ctx.fillStyle=palette.wine;ctx.fillRect(0,0,W,H);ctx.strokeStyle='#a25b694c';ctx.lineWidth=2;for(let x=-128;x<640;x+=128)for(let y=-128;y<640;y+=128){ctx.beginPath();ctx.moveTo(x,y-58);ctx.lineTo(x+58,y);ctx.lineTo(x,y+58);ctx.lineTo(x-58,y);ctx.closePath();ctx.stroke();ctx.strokeStyle='#c19c6d70';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#a25b694c';}});if(texture){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(20,20);}return texture;}
 const carpet=mat('#ffffff',{map:floorTexture(),roughness:.98});
 box(root,'BUILDER_WALKABLE_FLOOR_casino',0,-.18,0,80,.36,80,carpet);
 // A broad uninterrupted north/south promenade, with two cross aisles.
 box(root,'CASINO_MARBLE_WALK',0,.008,6,9,.016,64,marble,false);
 for(const x of [-4.6,4.6])box(root,'CASINO_AISLE_INLAY',x,.023,6,.12,.012,64,gold,false);
 for(const z of [-16,19]){box(root,'CASINO_CROSS_WALK',0,.018,z,64,.024,3.3,marble,false);for(const dz of [-1.75,1.75])box(root,'CASINO_AISLE_INLAY',0,.035,z+dz,64,.012,.1,gold,false);}
 const medallion=cylinder(root,'CASINO_FLOOR_MEDALLION',0,.027,22,3.9,.016,gold,64,false);cylinder(root,'CASINO_FLOOR_MEDALLION_INNER',0,.04,22,3.65,.016,wood,64,false);
 // The full structural shell stays solid, including its entrance vestibule.
 for(const x of [-39.65,39.65]){box(root,'CASINO_WALL',x,4,0,.7,8,80,dark);box(root,'CASINO_WALL_BASE',x>0?39.2:-39.2,.5,0,.2,1,79,wood);for(const y of [1.15,6.8])box(root,'CASINO_WALL_GOLD',x>0?39.05:-39.05,y,0,.1,.09,79,gold,false);}
 box(root,'CASINO_WALL_BACK',0,4,-39.65,80,8,.7,dark);
 box(root,'CASINO_ENTRANCE_WALL_LEFT',-23,4,39.65,34,8,.7,dark);box(root,'CASINO_ENTRANCE_WALL_RIGHT',23,4,39.65,34,8,.7,dark);box(root,'CASINO_ENTRANCE_HEADER',0,6.8,39.65,12,2.4,.7,wood);
 for(const x of [-6,6]){box(root,'CASINO_ENTRANCE_PILASTER',x,3.2,38.8,.5,6.4,.6,gold);}
 sign(root,'STARLIGHT',0,5.65,38.6,10,1.5,'#f4d69d',Math.PI,'MUZIKAZ  •  GRAND CASINO & SOCIAL CLUB');
 sign(root,'STARLIGHT GRAND CASINO',0,6.8,-22.4,14,1.25,'#f4d69d',0,'POKER   •   TABLE GAMES   •   SLOTS');
 for(const side of [-1,1])for(let z=-30;z<=30;z+=12){const x=side*38.8;box(root,'CASINO_WALL_PANEL',x,3.9,z,.18,4,7,wood,false);box(root,'CASINO_WALL_MIRROR',x-side*.12,4.1,z,.09,2.8,5.8,mat('#314451',{metalness:.75,roughness:.18}),false);for(const dz of [-3.5,3.5])box(root,'CASINO_PANEL_TRIM',x-side*.18,3.9,z+dz,.08,4,.06,gold,false);}
 // A down-facing coffered ceiling finishes the interior. It is decorative,
 // excluded from floor/spawn collision, and naturally invisible from above.
 const ceilingTexture=canvasTexture(512,512,(ctx,W,H)=>{ctx.fillStyle='#26313d';ctx.fillRect(0,0,W,H);ctx.fillStyle='#1b2633';ctx.fillRect(24,24,W-48,H-48);ctx.strokeStyle='#b29158';ctx.lineWidth=3;ctx.strokeRect(18,18,W-36,H-36);ctx.strokeStyle='#53606a';ctx.lineWidth=2;ctx.strokeRect(38,38,W-76,H-76);ctx.strokeStyle='#877343';ctx.lineWidth=1;ctx.strokeRect(47,47,W-94,H-94);});
 if(ceilingTexture){ceilingTexture.wrapS=ceilingTexture.wrapT=T.RepeatWrapping;ceilingTexture.repeat.set(8,8);}
 const ceiling=mesh(root,new T.PlaneGeometry(79.3,79.3),mat('#ffffff',{map:ceilingTexture,roughness:.85,emissive:'#14202b',emissiveIntensity:.35}),'CASINO_CEILING',0,7.99,0,false);ceiling.rotation.x=Math.PI/2;
 for(let n=-30;n<=30;n+=10){
  box(root,'CASINO_CEILING_GOLD_GRID',n,7.84,0,.08,.08,79,gold,false);box(root,'CASINO_CEILING_GOLD_GRID',0,7.84,n,79,.08,.08,gold,false);
  if(n!==0){box(root,'CASINO_CEILING_LIGHT_STRIP',n+.12,7.82,0,.055,.035,78,glow,false);box(root,'CASINO_CEILING_LIGHT_STRIP',0,7.82,n+.12,78,.035,.055,glow,false);}
 }
 // Slender architecture leaves all gaming aisles clear.
 for(const x of [-9,9])for(const z of [-18,19,35]){cylinder(root,'CASINO_COLUMN',x,3.25,z,.32,6.5,wood,20);for(const y of [.2,6.25])cylinder(root,'CASINO_COLUMN_CAPITAL',x,y,z,.58,.32,gold,20);}
 for(const z of [-12,12,31]){
  const pendant=new T.Group();pendant.position.set(0,6.8,z);root.add(pendant);
  const ring=mesh(pendant,new T.TorusGeometry(2,.09,8,48),gold,'CASINO_CHANDELIER_RING',0,0,0,false);ring.rotation.x=Math.PI/2;
  const outer=mesh(pendant,new T.TorusGeometry(2.6,.045,6,48),gold,'CASINO_CHANDELIER_RING',0,.35,0,false);outer.rotation.x=Math.PI/2;
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2,x=Math.cos(a)*2,zp=Math.sin(a)*2;cylinder(pendant,'CASINO_LIGHT_CRYSTAL',x,-.22,zp,.045,.5,glow,6,false);}
  cylinder(pendant,'CASINO_LIGHT_STEM',0,.65,0,.05,1.4,gold,8,false);
  const light=new T.PointLight('#ffe3b3',48,30,2);light.position.set(0,-.4,0);pendant.add(light);
 }
 root.add(new T.HemisphereLight('#ffe2c1','#192230',2.2));
 const fill=new T.DirectionalLight('#fff4e2',1.1);fill.position.set(6,12,10);root.add(fill);
 function group(name,x,z){const g=new T.Group();g.name=name;g.position.set(x,0,z);root.add(g);return g;}
 function chair(parent,x,z,rotation=0){const g=new T.Group();g.position.set(x,0,z);g.rotation.y=rotation;parent.add(g);box(g,'CASINO_CHAIR_SEAT',0,.56,0,.68,.2,.7,velvet);box(g,'CASINO_CHAIR_BACK',0,1.05,.28,.7,.85,.16,velvet);for(const side of [-1,1]){box(g,'CASINO_CHAIR_ARM',side*.4,.8,0,.1,.13,.64,gold);for(const dz of [-.22,.22])cylinder(g,'CASINO_CHAIR_LEG',side*.25,.27,dz,.035,.55,gold,6);}return g;}
 const chipMaterials=['#f6e8cc','#d84865','#4a89bf','#252c36','#49a781'].map(color=>mat(color));
 function chips(parent,x,z,count=7,color=1){for(let i=0;i<count;i++){const chip=cylinder(parent,'CASINO_CHIP',x,1.21+i*.035,z,.12,.032,chipMaterials[color%chipMaterials.length],16,false);if(i===count-1){const ring=mesh(parent,new T.TorusGeometry(.08,.009,4,14),gold,'CASINO_CHIP_RIM',x,1.23+i*.035,z,false);ring.rotation.x=Math.PI/2;}}}
 const cardFace=canvasTexture(128,192,(ctx,W,H)=>{ctx.fillStyle='#f8efe1';ctx.fillRect(0,0,W,H);ctx.fillStyle='#b62f4f';ctx.font='bold 40px Georgia';ctx.fillText('A',10,43);ctx.font='65px Georgia';ctx.fillText('♥',35,118);});
 const cardMat=mat('#f5e9d2',{map:cardFace,roughness:.7});
 function card(parent,x,z,angle=0){const m=box(parent,'CASINO_CARD',x,1.224,z,.26,.012,.39,cardMat,false);m.rotation.y=angle;return m;}
 function oval(parent,w=5.8,d=3.4,segments=64,tableFelt=felt){const base=cylinder(parent,'CASINO_TABLE_BASE',0,.5,0,1,.95,wood,32);base.scale.set(1.6,1,1);const rail=cylinder(parent,'CASINO_TABLE_RAIL',0,1.08,0,1,.2,wood,segments);rail.scale.set(w/2,1,d/2);const trim=cylinder(parent,'CASINO_TABLE_BRASS',0,1.176,0,1,.045,gold,segments);trim.scale.set(w/2-.08,1,d/2-.08);const top=cylinder(parent,'CASINO_TABLE_FELT',0,1.205,0,1,.024,tableFelt,segments);top.scale.set(w/2-.18,1,d/2-.18);return top;}
 function playingTable(id,kind,x,z){const g=group(id,x,z);stations.set(id,g);const tableFelt=mat(id.endsWith('2')?(kind==='POKER'?'#253f6b':'#384f64'):palette.felt);oval(g,5.8,3.4,kind==='POKER'?8:64,tableFelt);for(let i=0;i<4;i++){const a=Math.PI*.18+i*Math.PI*.21;chair(g,Math.cos(a)*3.25,Math.sin(a)*2.1,-a+Math.PI/2);chips(g,Math.cos(a)*2,Math.sin(a)*1.05,4+i,i);card(g,Math.cos(a)*1.8,Math.sin(a)*.8,a);card(g,Math.cos(a)*1.8+.3,Math.sin(a)*.8,a+.12);}
  const shoe=box(g,'CASINO_DEALER_SHOE',1.7,1.32,-.7,.45,.2,.6,dark,false);chips(g,-1.6,-.65,12,0);g.userData.casinoHandCards=[];for(let i=0;i<7;i++){const m=card(g,-1+i*.33,0,(i-2)*.03);m.visible=i<5;g.userData.casinoHandCards.push(m);}
  sign(g,kind.toUpperCase(),0,2.7,-2.25,4.8,.75,'#f2d598',0,kind==='POKER'?'FIVE-CARD DRAW  •  AI HOUSE DEALER':'HIT / STAND  •  DEALER STANDS ON 17');
  const dealCard=card(g,0,-.3);animations.push(t=>{dealCard.position.x=Math.sin(t*.55)*.65;dealCard.rotation.y=Math.sin(t*.55)*.14;});return g;
 }
 playingTable('casino-poker-1','POKER',-20,-8);playingTable('casino-poker-2','POKER',-20,9);playingTable('casino-blackjack-1','BLACKJACK',19,-8);playingTable('casino-blackjack-2','BLACKJACK',19,9);
 const roulette=group('casino-roulette-1',-20,-24);stations.set('casino-roulette-1',roulette);oval(roulette,6.3,3.7);
 const wheel=new T.Group();wheel.position.set(-1.7,1.28,0);roulette.add(wheel);cylinder(wheel,'CASINO_ROULETTE_BRASS',0,0,0,1,.14,gold,64,false);cylinder(wheel,'CASINO_ROULETTE_WOOD',0,.08,0,.89,.07,wood,64,false);
 const rouletteNumbers=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
 const wheelTexture=canvasTexture(1024,1024,(ctx,W,H)=>{const c=W/2,r=W*.48;for(let i=0;i<37;i++){const a=i/37*Math.PI*2-Math.PI/2,b=(i+1)/37*Math.PI*2-Math.PI/2;ctx.beginPath();ctx.moveTo(c,c);ctx.arc(c,c,r,a,b);ctx.closePath();ctx.fillStyle=i===0?'#20845b':i%2?'#af2b43':'#132831';ctx.fill();ctx.strokeStyle='#d8b56e';ctx.lineWidth=3;ctx.stroke();ctx.save();ctx.translate(c+Math.cos((a+b)/2)*r*.82,c+Math.sin((a+b)/2)*r*.82);ctx.rotate((a+b)/2+Math.PI/2);ctx.font='bold 28px Georgia';ctx.textAlign='center';ctx.fillStyle='#fff0c5';ctx.fillText(String(rouletteNumbers[i]),0,10);ctx.restore();}ctx.fillStyle='#3d2831';ctx.beginPath();ctx.arc(c,c,r*.55,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d8b56e';ctx.lineWidth=9;ctx.stroke();});
 const wheelTop=mesh(wheel,new T.CircleGeometry(.85,74),mat('#ffffff',{map:wheelTexture}),'CASINO_ROULETTE_NUMBERS',0,.15,0,false);wheelTop.rotation.x=-Math.PI/2;

 cylinder(wheel,'CASINO_ROULETTE_SPINDLE',0,.29,0,.11,.35,gold,16,false);const ball=mesh(roulette,new T.SphereGeometry(.06,10,8),marble,'CASINO_ROULETTE_BALL',-.9,1.53,0,false);
 const layoutTex=canvasTexture(768,512,(ctx,W,H)=>{ctx.fillStyle='#146051';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#eddbaf';ctx.lineWidth=4;ctx.font='34px Georgia';ctx.textAlign='center';for(let i=0;i<36;i++){const col=i%12,row=Math.floor(i/12),x=col*W/12,y=row*H/4;ctx.fillStyle=i%2?'#1c2930':'#9e3048';ctx.fillRect(x+3,y+3,W/12-6,H/4-6);ctx.fillStyle='#ffe8c0';ctx.fillText(String(i+1),x+W/24,y+H/8+12);}ctx.fillStyle='#f8e7bc';ctx.font='34px system-ui';ctx.fillText('RED   •   BLACK   •   EVEN   •   ODD',W/2,H*.91);});
 const layout=box(roulette,'CASINO_ROULETTE_BETTING',1.1,1.235,0,2.8,.018,2.7,mat('#ffffff',{map:layoutTex}),false);chips(roulette,2.4,.75,7,3);sign(roulette,'ROULETTE',0,2.9,-2.5,5.3,.8,'#f2d598',0,'EUROPEAN WHEEL  •  SINGLE ZERO');
 animations.push(t=>{
  const age=wheel.userData.resultAt===undefined?Infinity:((typeof performance==='undefined'?0:performance.now())-wheel.userData.resultAt)/1000;
  if(Number.isInteger(wheel.userData.resultNumber)&&age>=2.2){wheel.rotation.y=0;const a=(rouletteNumbers.indexOf(wheel.userData.resultNumber)+.5)/37*Math.PI*2-Math.PI/2;ball.position.set(-1.7+Math.cos(a)*.73,1.53,Math.sin(a)*.73);}
  else {wheel.rotation.y=t*.32;ball.position.set(-1.7+Math.cos(-t*(age<2.2?8:.65))*.77,1.53,Math.sin(-t*(age<2.2?8:.65))*.77);}
 });
 const dice=group('casino-dice-1',20,-24);stations.set('casino-dice-1',dice);oval(dice,6.2,3.5);sign(dice,'HOSTED DICE',0,2.9,-2.5,5,.8,'#f2d598',0,'CALL HIGH OR LOW  •  ROLL TWO DICE');
 const diceFaces=Array.from({length:6},(_,face)=>{const pips=[[],[[.5,.5]],[[.25,.25],[.75,.75]],[[.25,.25],[.5,.5],[.75,.75]],[[.25,.25],[.75,.25],[.25,.75],[.75,.75]],[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],[[.25,.2],[.75,.2],[.25,.5],[.75,.5],[.25,.8],[.75,.8]]][face+1];return mat('#ffffff',{map:canvasTexture(128,128,(ctx,W,H)=>{ctx.fillStyle='#f6eee1';ctx.fillRect(0,0,W,H);ctx.fillStyle='#13252b';for(const [x,y]of pips){ctx.beginPath();ctx.arc(W*x,H*y,9,0,Math.PI*2);ctx.fill();}})});});
 for(const x of [-.35,.35]){const die=box(dice,'CASINO_DIE',x,1.4,0,.28,.28,.28,[diceFaces[1],diceFaces[4],diceFaces[0],diceFaces[5],diceFaces[2],diceFaces[3]],false);diceMeshes.push(die);animations.push(t=>{if(die.userData.settled){die.rotation.set(0,0,0);die.position.y=1.4;return;}const roll=Math.max(0,Math.sin(t*.7));die.rotation.set(roll*.9+x,roll*1.4,roll*.65);die.position.y=1.4+roll*.09;});}for(let i=0;i<4;i++)chips(dice,-1.8+i*1.1,.85,5+i,i);
 // Twelve luminous slot cabinets, facing the gaming floor.
 const slotTexture=canvasTexture(512,512,(ctx,W,H)=>{ctx.fillStyle='#081e2a';ctx.fillRect(0,0,W,H);const gradient=ctx.createLinearGradient(0,0,W,H);gradient.addColorStop(0,'#64eee2');gradient.addColorStop(1,'#b681ed');ctx.fillStyle=gradient;ctx.font='bold 57px Georgia';ctx.textAlign='center';ctx.fillText('STARLIGHT',W/2,82);ctx.fillStyle='#eed49b';ctx.font='25px system-ui';ctx.fillText('LUCKY SEVENS',W/2,126);ctx.fillStyle='#d6e7de';ctx.fillRect(28,169,W-56,236);ctx.fillStyle='#143535';ctx.font='bold 126px Georgia';for(let i=0;i<3;i++)ctx.fillText('7',103+i*152,326);ctx.strokeStyle='#cea35b';ctx.lineWidth=7;ctx.strokeRect(26,167,W-52,240);ctx.fillStyle='#9ef0de';ctx.font='22px system-ui';ctx.fillText('SPIN TO PLAY  •  MZK',W/2,465);});
 const screenMat=mat('#ffffff',{map:slotTexture,emissive:'#a7e4dc',emissiveMap:slotTexture,emissiveIntensity:.45,roughness:.25});
 let slotId=0;for(const side of [-1,1])for(const z of [-15,-8,-1,6,13,20]){
  const g=group('casino-slot-'+ ++slotId,side*32,z),spinPhase=slotId;g.userData.slotTheme=['EMERALD','ROYAL','STARDUST'][(slotId-1)%3];g.rotation.y=side<0?Math.PI/2:-Math.PI/2;stations.set(g.name,g);
  box(g,'CASINO_SLOT_BASE',0,.48,0,1.45,.95,1.3,wood);box(g,'CASINO_SLOT_CABINET',0,1.7,-.18,1.42,1.65,.88,dark);box(g,'CASINO_SLOT_GOLD_FRAME',0,1.85,.31,1.32,1.55,.1,gold,false);const slotScreen=box(g,'CASINO_SLOT_SCREEN',0,1.86,.373,1.16,1.32,.025,screenMat,false);slotScreens.set(g.name,slotScreen);
  box(g,'CASINO_SLOT_CONSOLE',0,1.13,.36,1.42,.18,.82,dark);for(const x of [-.42,0,.42])cylinder(g,'CASINO_SLOT_BUTTON',x,1.242,.58,.08,.035,x===0?glow:cyan,12,false);box(g,'CASINO_SLOT_PAYMENT',.33,.91,.69,.28,.1,.025,steel,false);
  box(g,'CASINO_SLOT_TOPPER',0,2.8,-.15,1.5,.34,.8,slotId%3===0?steel:gold);sign(g,g.userData.slotTheme,0,2.81,.27,1.24,.26,slotId%3===0?'#d8e9ff':'#ffe49b');if(slotId%3===1){const arch=mesh(g,new T.TorusGeometry(.62,.035,6,22,Math.PI),gold,'CASINO_SLOT_ART_DECO_ARCH',0,2.79,-.15,false);arch.rotation.z=0;}if(slotId%3===2)for(const sideDetail of [-1,1])box(g,'CASINO_SLOT_FLUTED_TRIM',sideDetail*.68,1.9,.36,.05,1.4,.03,magenta,false);
  chair(g,0,1.7,0);const strips=[];for(const x of [-.73,.73])strips.push(box(g,'CASINO_SLOT_LIGHT',x,1.8,.32,.045,1.8,.05,slotId%2?cyan:magenta,false));
  const sparks=new T.Group();sparks.position.set(0,1.82,.4);g.add(sparks);for(let j=0;j<3;j++){const mark=box(sparks,'CASINO_SLOT_REEL_GLOW',-.36+j*.36,0,.01,.22,.016,.015,glow,false);mark.userData.initialPhase=j+slotId;}
  animations.push(t=>{sparks.children.forEach((mark,i)=>{mark.position.y=Math.sin(t*(1.6+(spinPhase%3)*.2)+i*2+z)*.28;});});
 }
 sign(root,'SLOTS',-35,4.8,-1,5,1,'#7ef3e7',Math.PI/2,'12 LUCKY SEVENS MACHINES');sign(root,'SLOTS',35,4.8,-1,5,1,'#e7a9ef',-Math.PI/2,'PLAY WITH MZK');
 function counter(id,title,x,z){const g=group(id,x,z);stations.set(id,g);box(g,'CASINO_COUNTER_BODY',0,.6,0,10,1.2,2,wood);box(g,'CASINO_COUNTER_INLAY',0,.72,-1.015,9.5,.6,.03,velvet,false);box(g,'CASINO_COUNTER_TOP',0,1.25,0,10.4,.15,2.3,marble);for(const xx of [-5,5])box(g,'CASINO_COUNTER_TRIM',xx,.6,-1.04,.09,1.2,.06,gold,false);sign(g,title,0,3.8,1.5,7,1.05,'#f5d9a1',Math.PI);sign(g,title,0,3.8,-1.5,7,1.05,'#f5d9a1');return g;}
 const bar=counter('casino-vendor','THE VELVET BAR',-22,29);for(let i=0;i<8;i++){const bottle=cylinder(bar,'CASINO_BAR_BOTTLE',-4+i*1.1,1.6,.2,.1,.55,i%2?cyan:gold,10,false);cylinder(bar,'CASINO_BOTTLE_NECK',-4+i*1.1,1.91,.2,.045,.16,steel,8,false);}for(let i=0;i<3;i++){cylinder(bar,'CASINO_BAR_GLASS',2.2+i*.5,1.46,-.6,.1,.26,marble,12,false);}
 const cashier=counter('casino-cashier','CASHIER & BANK',22,29);for(const x of [-2.5,2.5]){box(cashier,'CASINO_CASHIER_MONITOR',x,1.65,.3,1,.65,.14,dark);box(cashier,'CASINO_CASHIER_DISPLAY',x,1.65,.215,.9,.55,.02,cyan,false);cylinder(cashier,'CASINO_CASHIER_STAND',x,1.4,.3,.08,.3,gold,10,false);}sign(cashier,'MZK BALANCE • HISTORY • RECEIPTS',0,2.6,-1.15,7,.55,'#b5dcd1');
 const atm=group('casino-atm',31,29);stations.set('casino-atm',atm);box(atm,'CASINO_ATM_CABINET',0,1.2,0,1.8,2.4,1.3,dark);box(atm,'CASINO_ATM_FACE',0,1.6,-.67,1.55,1.2,.08,gold);box(atm,'CASINO_ATM_SCREEN',0,1.76,-.72,1.2,.64,.03,cyan,false);box(atm,'CASINO_ATM_KEYPAD',0,1.22,-.75,.8,.21,.08,steel,false);box(atm,'CASINO_ATM_SLOT',0,.89,-.69,.76,.12,.03,wood,false);sign(atm,'MZK ATM',0,2.8,-.71,2.3,.6,'#94ece2');
 const host=group('casino-host',-5,30);stations.set('casino-host',host);box(host,'CASINO_HOST_PODIUM',0,.65,0,1.1,1.3,.8,wood);box(host,'CASINO_HOST_PODIUM_TOP',0,1.34,0,1.3,.1,1,gold);sign(host,'WELCOME',0,1.12,-.41,.95,.25,'#ead09a');
 // Lounge chairs never occupy the entrance or promenade.
 for(const x of [-33,34])for(const z of [34,37]){chair(root,x,z,x<0?Math.PI/2:-Math.PI/2);}for(const x of [-30,31]){cylinder(root,'CASINO_LOUNGE_TABLE',x,.65,35.5,.7,.12,marble,32);cylinder(root,'CASINO_LOUNGE_PEDESTAL',x,.31,35.5,.13,.6,gold,12);}
 // A bank-grade safe room has four solid walls and a permanently locked door.
 const vault=group('CASINO_BANK_VAULT',0,-30);
 box(vault,'CASINO_VAULT_BACK_WALL',0,2.8,-7,14,5.6,.7,steel);for(const x of [-7,7])box(vault,'CASINO_VAULT_SIDE_WALL',x,2.8,0,.7,5.6,14,steel);
 for(const x of [-4.6,4.6])box(vault,'CASINO_VAULT_FRONT_WALL',x,2.8,7,5.2,5.6,.8,wood);box(vault,'CASINO_VAULT_LINTEL',0,5.1,7,4,1,.8,wood);
 box(vault,'CASINO_VAULT_DOOR_LOCKED',0,2,7.06,4,4,.75,steel);for(const x of [-2.1,2.1])box(vault,'CASINO_VAULT_FRAME',x,2.05,7.6,.18,4.3,.15,gold,false);box(vault,'CASINO_VAULT_FRAME',0,4.2,7.6,4.4,.18,.15,gold,false);
 const doorRing=mesh(vault,new T.TorusGeometry(1.45,.07,10,48),dark,'CASINO_VAULT_DOOR_RING',0,2,7.47,false);const handwheel=mesh(vault,new T.TorusGeometry(.55,.055,8,32),gold,'CASINO_VAULT_HANDLE',.1,1.9,7.58,false);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;const spoke=box(vault,'CASINO_VAULT_HANDLE_SPOKE',.1+Math.cos(a)*.27,1.9+Math.sin(a)*.27,7.58,.55,.055,.07,gold,false);spoke.rotation.z=a;}
 for(const x of [-1.55,1.55])for(const y of [.5,1.5,2.5,3.5])cylinder(vault,'CASINO_VAULT_LOCK_BOLT',x,y,7.5,.1,.15,gold,10,false).rotation.x=Math.PI/2;
 sign(vault,'BANK VAULT',0,5.1,7.48,7,.95,'#f4d39a',0,'LOCKED  •  AUTHORIZED STAFF ONLY');const lock=box(vault,'CASINO_VAULT_LOCK_LIGHT',1.35,2,7.5,.15,.15,.06,mat('#e55763',{emissive:'#c93c4f',emissiveIntensity:.65}),false);
 for(const side of [-1,1])for(let i=0;i<3;i++)box(vault,'CASINO_VAULT_SAFE_DEPOSIT',side*5,1+i*1.15,-4,2,1,1.4,dark);
 // Solid brass planters soften the edge without obstructing circulation.
 for(const [x,z]of [[-11,33],[11,33],[-11,-21],[11,-21],[-36,26],[36,26]]){cylinder(root,'CASINO_PLANTER',x,.55,z,.55,1.1,gold,20);for(let i=0;i<7;i++){const leaf=mesh(root,new T.SphereGeometry(.48,8,6),felt,'CASINO_PLANT_LEAF',x+Math.cos(i)*.3,1.5+i%3*.2,z+Math.sin(i)*.3,false);leaf.scale.set(.45,1.5,.8);leaf.rotation.z=Math.cos(i)*.5;}}
 sign(root,'POKER & ROULETTE',-19,4.5,19.1,11,1.1,'#eacb91');sign(root,'BLACKJACK & HOSTED DICE',19,4.5,19.1,12,1.1,'#eacb91');
 // Quiet social pockets give guests places to relax between games while
 // every station keeps its original approach and the promenades remain open.
 const loungeFabric=mat('#274752'),plumFabric=mat('#56334c'),creamFabric=mat('#c9bda2');
 function sofa(parent,x,z,rotation=0,fabric=loungeFabric){const g=new T.Group();g.name='CASINO_SOCIAL_SOFA';g.position.set(x,0,z);g.rotation.y=rotation;parent.add(g);box(g,'CASINO_LOUNGE_SOFA_BASE',0,.3,0,2.7,.44,.92,wood);for(let cushion=0;cushion<3;cushion++){box(g,'CASINO_LOUNGE_SOFA_CUSHION',(cushion-1)*.8,.56,-.08,.77,.25,.83,fabric);box(g,'CASINO_LOUNGE_SOFA_BACK_CUSHION',(cushion-1)*.83,.98,.36,.8,.76,.24,fabric);}box(g,'CASINO_LOUNGE_SOFA_BACK',0,.78,.47,2.7,.8,.1,wood);for(const side of [-1,1]){box(g,'CASINO_LOUNGE_SOFA_ARM',side*1.3,.75,0,.22,.5,.95,fabric);box(g,'CASINO_LOUNGE_SOFA_FOOT',side*1.05,.09,.28,.12,.18,.12,gold);}return g;}
 function coffeeTable(x,z){cylinder(root,'CASINO_SOCIAL_COFFEE_TABLE',x,.56,z,.85,.1,marble,24);cylinder(root,'CASINO_SOCIAL_COFFEE_BASE',x,.27,z,.25,.54,gold,12);for(const dx of [-.25,.25])cylinder(root,'CASINO_SOCIAL_COFFEE_CUP',x+dx,.68,z,.075,.15,creamFabric,10,false);}
 for(const side of [-1,1]){
  const cx=side*30;
  sofa(root,cx,-35.2,Math.PI,side<0?plumFabric:loungeFabric);sofa(root,cx+side*3.15,-32.25,side<0?-Math.PI/2:Math.PI/2,side<0?plumFabric:loungeFabric);coffeeTable(cx,-32.3);
  const tableLamp=cylinder(root,'CASINO_LOUNGE_LAMP_STEM',cx-side*3,.9,-35.6,.035,1.7,gold,10);mesh(root,new T.ConeGeometry(.42,.65,16,1,true),glow,'CASINO_LOUNGE_LAMP_SHADE',cx-side*3,1.8,-35.6,false);
  sign(root,side<0?'VELVET CONVERSATION SALON':'SKYLINE SOCIAL SALON',cx,3.4,-38.9,9,.8,'#e3c694',0,'RELAX  •  MEET A GUEST  •  SHARE A STORY');
  for(let j=0;j<3;j++){const artwork=mesh(root,new T.TorusGeometry(.48+j*.11,.035,5,24),j%2?steel:gold,'CASINO_SALON_WALL_ART',cx+(j-1)*2.15,5,-39.1,false);artwork.rotation.z=j*.35;}
 }
 // Two compact conversation nooks face the central walkway, away from the
 // guest circulation lanes at x=±7 and the gaming tables at x=±20.
 for(const side of [-1,1]){
  sofa(root,side*11.7,-5,side<0?-Math.PI/2:Math.PI/2,side<0?plumFabric:loungeFabric);coffeeTable(side*10,-5);
 }
 // A genuine hospitality back bar: stocked shelves, coffee preparation,
 // glass storage and a menu guests can read from the public counter.
 box(root,'CASINO_BAR_BACK_CABINET',-22,.65,35.3,10.1,1.3,1.4,wood);box(root,'CASINO_BAR_BACK_MARBLE',-22,1.36,35.3,10.4,.15,1.6,marble);
 for(const y of [2.05,2.85]){box(root,'CASINO_BAR_SHELF',-22,y,36.4,10.2,.09,.72,gold);for(let i=0;i<9;i++){const x=-26.4+i*1.1;cylinder(root,'CASINO_BACK_BAR_BOTTLE',x,y+.26,36.4,.09,.46,i%3===0?cyan:i%3===1?magenta:gold,10,false);cylinder(root,'CASINO_BACK_BAR_BOTTLE_NECK',x,y+.53,36.4,.035,.12,steel,8,false);}}
 box(root,'CASINO_COFFEE_MACHINE',-25.6,1.68,35.25,1.2,.6,.8,steel);box(root,'CASINO_COFFEE_MACHINE_FACE',-25.6,1.67,34.82,.95,.38,.04,dark,false);for(const x of [-25.85,-25.4]){cylinder(root,'CASINO_COFFEE_SPOUT',x,1.47,34.78,.035,.15,gold,8,false);cylinder(root,'CASINO_COFFEE_CUP',x,1.52,34.56,.085,.16,creamFabric,10,false);}
 sign(root,'VELVET LOUNGE MENU',-22,4,36.8,8.2,1.25,'#f0d5a4',Math.PI,'ESPRESSO  •  SPARKLING CITRUS  •  HOUSE TONIC');
 sofa(root,20.5,36.2,0,creamFabric);sofa(root,24,36.2,0,creamFabric);sign(root,'CASHIER WAITING LOUNGE',22.2,3.3,38.9,8,.7,'#e0c793',Math.PI,'YOUR MZK BALANCE & SETTLEMENT HISTORY');
 // Information stays on physical boards and floor inlays, so directions do
 // not compete with dialogue or the player's view of the casino floor.
 const information=group('CASINO_INFORMATION_BOARD',-12,31);
 box(information,'CASINO_INFO_BOARD_BASE',0,.08,0,1.8,.16,.8,gold);box(information,'CASINO_INFO_BOARD_SUPPORT',0,1.3,0,.12,2.6,.12,gold);box(information,'CASINO_INFO_BOARD_FRAME',0,2.1,0,2.8,2.2,.16,wood);
 const boardTexture=canvasTexture(768,768,(ctx,W,H)=>{ctx.fillStyle='#142730';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#cba562';ctx.lineWidth=8;ctx.strokeRect(12,12,W-24,H-24);ctx.textAlign='center';ctx.fillStyle='#efd6a2';ctx.font='600 57px Georgia';ctx.fillText('FIND YOUR EVENING',W/2,95);ctx.textAlign='left';ctx.font='38px system-ui';['←  POKER & ROULETTE','→  BLACKJACK & HOSTED DICE','←  VELVET LOUNGE','→  CASHIER & MZK ATM','↑  LOCKED VAULT CORRIDOR'].forEach((line,i)=>ctx.fillText(line,46,204+i*90));ctx.font='28px system-ui';ctx.fillStyle='#b7d1c5';ctx.fillText('Walk up to a resident to start a conversation.',40,710);});
 const board=mesh(information,new T.PlaneGeometry(2.64,2.04),new T.MeshBasicMaterial({map:boardTexture,color:boardTexture?'#ffffff':'#cba562'}),'CASINO_INFORMATION_BOARD_FACE',0,2.1,.09,false);
 function zoneInlay(text,x,z,w=6,h=1.1){const texture=canvasTexture(1024,160,(ctx,W,H)=>{ctx.clearRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#dec89b';ctx.font='500 62px Georgia';ctx.fillText(text,W/2,112);});const plane=mesh(root,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,color:texture?'#ffffff':'#dec89b',transparent:true,depthWrite:false}),'CASINO_ZONE_INLAY_'+text,x,.045,z,false);plane.rotation.x=-Math.PI/2;}
 zoneInlay('POKER SALON',-20,16,7);zoneInlay('BLACKJACK SALON',19,16,8);zoneInlay('ROULETTE',-20,-18.4,5);zoneInlay('HOSTED DICE',20,-18.4,6);zoneInlay('VELVET LOUNGE',-22,25.4,7);zoneInlay('CASHIER  ·  ATM',24,25.4,7);zoneInlay('STARLIGHT',0,22,5.8,1.15);
 // Table-top finishes distinguish the salons without altering their rules.
 for(const [id,table]of stations){if(!id.startsWith('casino-poker')&&!id.startsWith('casino-blackjack'))continue;const kind=id.includes('poker')?'DRAW POKER':'BLACKJACK';const texture=canvasTexture(768,256,(ctx,W,H)=>{ctx.clearRect(0,0,W,H);ctx.strokeStyle='#d7c18a';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(W/2,H/2,W*.46,H*.4,0,0,Math.PI*2);ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#e0c995';ctx.font='42px Georgia';ctx.fillText(kind,W/2,H*.52);ctx.font='21px system-ui';ctx.fillText(id.includes('poker')?'FIVE-CARD DRAW  •  HOUSE PAYTABLE':'DEALER STANDS ON 17',W/2,H*.73);});const plane=mesh(table,new T.PlaneGeometry(3.7,1.25),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,color:'#ffffff'}),'CASINO_TABLE_FELT_INLAY',0,1.225,-.48,false);plane.rotation.x=-Math.PI/2;for(const side of [-1,1])cylinder(table,'CASINO_TABLE_CUP_HOLDER',side*2.45,1.195,.1,.11,.025,steel,12,false);}
 root.userData.casinoStations=stations;
 root.userData.updateCasinoEffects=(elapsed,reducedMotion=false)=>{
  if(!reducedMotion)for(const animation of animations)animation(elapsed);
  else if(Number.isInteger(wheel.userData.resultNumber)){wheel.rotation.y=0;const a=(rouletteNumbers.indexOf(wheel.userData.resultNumber)+.5)/37*Math.PI*2-Math.PI/2;ball.position.set(-1.7+Math.cos(a)*.73,1.53,Math.sin(a)*.73);}
  const now=typeof performance==='undefined'?0:performance.now();
  for(const [id,play]of recentPlays){const age=(now-play.at)/1000;play.light.intensity=age<3?(reducedMotion?5:5+Math.sin(age*9)*2):0;if(age>=3){play.station.remove(play.light);recentPlays.delete(id);}}
 };
 root.userData.animateCasinoStation=(id,outcome)=>{
  const station=stations.get(id);if(!station)return;
  station.userData.casinoOutcome=outcome;station.userData.casinoPlayedAt=typeof performance==='undefined'?0:performance.now();
  const prior=recentPlays.get(id);if(prior)station.remove(prior.light);
  const receipt=outcome?.round||(typeof outcome?.game==='object'?outcome.game:null)||outcome?.result||outcome;
  const won=Number(receipt?.payoutMzk||receipt?.payout||0)>0;
  const light=new T.PointLight(won?'#f8d580':'#79ddd4',7,7,2);light.position.set(0,2.8,0);station.add(light);recentPlays.set(id,{station,light,at:station.userData.casinoPlayedAt});
  if(id==='casino-roulette-1'&&Number.isInteger(receipt?.number)){wheel.userData.resultNumber=receipt.number;wheel.userData.resultAt=station.userData.casinoPlayedAt;wheel.rotation.y=0;const a=(rouletteNumbers.indexOf(receipt.number)+.5)/37*Math.PI*2-Math.PI/2;ball.position.set(-1.7+Math.cos(a)*.73,1.53,Math.sin(a)*.73);}
  if(id==='casino-dice-1'&&Array.isArray(receipt?.dice)){diceMeshes.forEach((die,i)=>{const face=Math.max(0,Math.min(5,Number(receipt.dice[i])-1));die.material=[diceFaces[1],diceFaces[4],diceFaces[face],diceFaces[5],diceFaces[2],diceFaces[3]];die.userData.settled=true;});}
  if(Array.isArray(receipt?.hand)&&station.userData.casinoHandCards){
   station.userData.casinoHandCards.forEach((m,i)=>{m.visible=i<receipt.hand.length;if(!m.visible)return;const value=receipt.hand[i],rank=['2','3','4','5','6','7','8','9','10','J','Q','K','A'][value%13],suit=['♠','♥','♦','♣'][Math.floor(value/13)];const texture=canvasTexture(128,192,(ctx,W,H)=>{ctx.fillStyle='#fff2db';ctx.fillRect(0,0,W,H);ctx.fillStyle=[1,2].includes(Math.floor(value/13))?'#bd304d':'#142b33';ctx.font='bold 38px Georgia';ctx.fillText(rank,8,42);ctx.font='68px Georgia';ctx.textAlign='center';ctx.fillText(suit,W/2,126);});if(m.material!==cardMat){m.material.map?.dispose();m.material.dispose();}m.material=mat('#ffffff',{map:texture});});
  }
  const slot=slotScreens.get(id);if(slot&&Array.isArray(receipt?.reels)){
   const symbols=['CHERRY','DIAMOND','7','SPADE','STAR','CROWN'];
   const texture=canvasTexture(512,512,(ctx,W,H)=>{ctx.fillStyle='#0e2230';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#f3d696';ctx.font='bold 58px Georgia';ctx.fillText('STARLIGHT',W/2,82);ctx.font='25px system-ui';ctx.fillText('LUCKY SEVENS',W/2,128);for(let i=0;i<3;i++){ctx.fillStyle='#e3eadc';ctx.fillRect(22+i*164,172,148,222);ctx.fillStyle='#174538';ctx.font='bold '+(symbols[receipt.reels[i]].length>3?24:40)+'px Georgia';ctx.fillText(symbols[receipt.reels[i]],96+i*164,295);}ctx.fillStyle='#9ee9ce';ctx.font='28px system-ui';ctx.fillText('PAYOUT  '+Number(receipt.payoutMzk||0)+' MZK',W/2,456);});
   if(slot.material!==screenMat){slot.material.map?.dispose();slot.material.dispose();}slot.material=mat('#ffffff',{map:texture,emissive:'#a7e4dc',emissiveMap:texture,emissiveIntensity:.45,roughness:.25});
  }

 };
 return root;
}
