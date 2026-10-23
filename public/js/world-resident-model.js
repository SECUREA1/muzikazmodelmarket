import * as T from '../vendor/three/three.module.min.js';

// Speech remains legible nearby without turning a character into a fullscreen
// billboard. Values are CSS pixels converted to world units for each camera.
export function residentLabelLayout({distance=1,viewportWidth=1280,viewportHeight=720,projectionY=1.8,speaking=false,visibilityDistance=distance}={}) {
 const pixelsWide=Math.min(260,Math.max(80,viewportWidth*.55));
 const pixelsHigh=Math.min(speaking?54:28,pixelsWide/4);
 const unitsPerPixel=2*Math.max(.1,distance)/Math.max(.1,projectionY)/Math.max(1,viewportHeight);
 const height=Math.min(speaking?.68:.38,pixelsHigh*unitsPerPixel);
 const opacity=speaking?T.MathUtils.clamp((19-visibilityDistance)/6,0,1):T.MathUtils.clamp((9-visibilityDistance)/4,0,1);
 return {width:height*4,height,opacity,pixelsWide,pixelsHigh};
}

// Kept for casino consumers; every world now shares the same camera-safe label.
export const casinoResidentLabelLayout=residentLabelLayout;

function residentVisualHash(value){let hash=2166136261;for(const character of String(value))hash=Math.imul(hash^character.charCodeAt(0),16777619);return hash>>>0;}
export function residentVisualStyle(state={}){
 const seed=residentVisualHash([state.personalityId,state.name,state.role,state.placeName,state.index].join('|'));
 const supplied=state.appearance||{},hairstyles=['short','swept','curly','bob','bun','bald'];
 const appearance={outfit:state.color||['#527d91','#8c687f','#698267','#997557','#5b6e9a'][seed%5],skin:state.skin||['#b78361','#e5ba98','#76503d','#c99275','#946343'][seed%5],hair:['#32241e','#332a29','#5b3928','#746452','#161e27'][Math.floor(seed/5)%5],accent:['#d8b56b','#a2d0c6','#c2a3dd'][seed%3],hairstyle:hairstyles[seed%6],accessory:['none','glasses','watch','earrings','necklace'][Math.floor(seed/7)%5],height:.95+seed%6*.025,build:.94+seed%5*.035,...supplied};
 if(!hairstyles.includes(appearance.hairstyle))appearance.hairstyle='short';
 const role=String(state.role||'').toLowerCase(),duty=String(state.duty||'').toLowerCase();
 let uniform=state.uniform||supplied.uniform;
 if(!uniform){if(duty==='guard'||/security|guard/.test(role))uniform='security';else if(state.casino&&['dealer','host','cashier','vendor'].includes(duty))uniform='formal';else if(/construction|builder|mechanic/.test(role+' '+duty))uniform='construction';else if(/ground crew|pilot|aviation/.test(role))uniform='aviation';else if(/dock crew|marina|nautical/.test(role))uniform='nautical';else if(/training|instructor|range/.test(role+' '+duty))uniform='training';else if(/activity host|coach|sports/.test(role+' '+duty))uniform='sports';else if(/musician|performer/.test(role+' '+duty))uniform='music';else if(/vendor|café|cafe|barista/.test(role+' '+duty))uniform='hospitality';else if(/resort host|reception|concierge/.test(role))uniform='formal';else uniform='casual';}
 return {appearance,uniform};
}

export function createWorldResident(){
 const root=new T.Group();root.name='MUZIKAZ_WORLD_RESIDENT';root.userData={builderObject:true,modelId:'world-resident',residentModel:true};
 const body=new T.Group();body.name='RESIDENT_BODY';root.add(body);
 const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.85,...extra});
 const outfit=material('#699dba'),skin=material('#b78361'),dark=material('#172a35'),hair=material('#33251f'),white=material('#f1eee6'),accent=material('#bd9b57',{metalness:.3,roughness:.5});
 root.userData.residentMaterials={outfit,skin,hair,accent,dark};
 const add=(parent,geometry,mat,position,name='')=>{const mesh=new T.Mesh(geometry,mat);mesh.name=name;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const box=(parent,size,mat,position,name='')=>add(parent,new T.BoxGeometry(...size),mat,position,name);
 const sphere=(parent,r,mat,position,name='')=>add(parent,new T.SphereGeometry(r,12,10),mat,position,name);
 const torso=add(body,new T.CapsuleGeometry(.22,.42,6,12),outfit,[0,1.05,0],'RESIDENT_TORSO');
 box(body,[.38,.2,.27],dark,[0,.73,0]);
 const head=new T.Group();head.name='RESIDENT_HEAD';head.position.set(0,1.52,0);body.add(head);
 sphere(head,.19,skin,[0,.1,0],'RESIDENT_FACE');
 const hairstyles=new T.Group();hairstyles.name='RESIDENT_HAIRSTYLES';head.add(hairstyles);
 function hairstyle(name){const group=new T.Group();group.name=name;group.visible=name==='short';hairstyles.add(group);return group;}
 add(hairstyle('short'),new T.SphereGeometry(.197,16,10,0,Math.PI*2,0,Math.PI*.47),hair,[0,.115,.015]);
 const swept=hairstyle('swept');add(swept,new T.SphereGeometry(.2,14,10,0,Math.PI*2,0,Math.PI*.44),hair,[0,.13,.02]);const sweep=sphere(swept,.13,hair,[-.07,.26,-.04]);sweep.scale.set(1.3,.48,1);sweep.rotation.z=-.2;
 const curly=hairstyle('curly');for(let i=0;i<9;i++){const a=i/9*Math.PI*2;sphere(curly,.078,hair,[Math.cos(a)*.13,.23+Math.sin(i*3)*.03,Math.sin(a)*.12+.01]);}sphere(curly,.14,hair,[0,.27,.03]);
 const bob=hairstyle('bob');add(bob,new T.SphereGeometry(.215,14,10,0,Math.PI*2,0,Math.PI*.5),hair,[0,.13,.02]);for(const side of [-1,1]){const sideHair=sphere(bob,.105,hair,[side*.17,.06,.045]);sideHair.scale.set(.6,1.6,1.05);}
 const bun=hairstyle('bun');add(bun,new T.SphereGeometry(.198,14,10,0,Math.PI*2,0,Math.PI*.47),hair,[0,.12,.02]);sphere(bun,.105,hair,[0,.23,.15]);hairstyle('bald');
 sphere(head,.045,skin,[0,.075,-.186],'RESIDENT_NOSE');
 for(const x of [-.075,.075]){sphere(head,.035,white,[x,.115,-.165]);sphere(head,.017,dark,[x,.115,-.193],'RESIDENT_PUPIL');sphere(head,.04,skin,[x*2.5,.09,0]);const brow=box(head,[.065,.014,.014],hair,[x,.165,-.18]);brow.rotation.z=x<0?.08:-.08;}
 const smile=add(head,new T.TorusGeometry(.055,.009,6,14,Math.PI),dark,[0,.015,-.177],'RESIDENT_MOUTH');smile.rotation.z=Math.PI;
 const glasses=new T.Group();glasses.name='RESIDENT_GLASSES';head.add(glasses);for(const x of [-.076,.076])add(glasses,new T.TorusGeometry(.048,.008,5,16),dark,[x,.11,-.205]);box(glasses,[.06,.01,.012],dark,[0,.11,-.208]);
 const earrings=new T.Group();earrings.name='RESIDENT_EARRINGS';head.add(earrings);for(const x of [-.198,.198])add(earrings,new T.TorusGeometry(.023,.006,5,12),accent,[x,.035,-.005]);
 const cap=new T.Group();cap.name='RESIDENT_GUARD_CAP';head.add(cap);add(cap,new T.CylinderGeometry(.18,.21,.11,16),dark,[0,.3,.01]);const brim=add(cap,new T.CylinderGeometry(.23,.23,.025,16),dark,[0,.245,-.05]);brim.scale.z=.8;box(cap,[.07,.055,.02],accent,[0,.31,-.18]);
 const limbs={};
 for(const side of [-1,1]){
  const leg=new T.Group();leg.name=side<0?'RESIDENT_LEFT_LEG':'RESIDENT_RIGHT_LEG';leg.position.set(side*.12,.72,0);body.add(leg);add(leg,new T.CapsuleGeometry(.085,.42,4,10),dark,[0,-.26,0]);box(leg,[.17,.12,.29],dark,[0,-.64,-.045]);
  const arm=new T.Group();arm.name=side<0?'RESIDENT_LEFT_ARM':'RESIDENT_RIGHT_ARM';arm.position.set(side*.27,1.26,0);body.add(arm);add(arm,new T.CapsuleGeometry(.07,.35,4,10),outfit,[0,-.22,0]);sphere(arm,.075,skin,[0,-.47,0]);const cuff=box(arm,[.14,.065,.14],white,[0,-.39,0],'RESIDENT_SHIRT_CUFF');cuff.visible=false;
  if(side===1){const watch=add(arm,new T.CylinderGeometry(.075,.075,.045,12),accent,[0,-.405,0],'RESIDENT_WATCH');watch.visible=false;}
  limbs[side]={arm,leg};
 }
 root.userData.residentLimbs=limbs;
 const formal=new T.Group();formal.name='RESIDENT_FORMAL_UNIFORM';body.add(formal);
 box(formal,[.26,.45,.05],white,[0,1.16,-.205],'RESIDENT_SHIRT_FRONT');
 const waistcoat=box(formal,[.37,.37,.075],dark,[0,1.04,-.22],'RESIDENT_WAISTCOAT');
 for(const side of [-1,1]){const lapel=box(formal,[.065,.26,.035],accent,[side*.09,1.23,-.25],'RESIDENT_LAPEL');lapel.rotation.z=side*.32;const bow=box(formal,[.065,.04,.038],dark,[side*.035,1.355,-.224],'RESIDENT_BOW_TIE');bow.rotation.z=side*.35;}
 for(let i=0;i<3;i++)sphere(formal,.011,accent,[0,.96+i*.075,-.263]);
 const badge=box(body,[.085,.11,.022],accent,[-.11,1.18,-.232],'RESIDENT_SECURITY_BADGE');
 const radio=box(body,[.075,.13,.05],dark,[.2,.85,-.16],'RESIDENT_GUARD_RADIO');box(radio,[.012,.11,.012],dark,[0,.105,0]);
 const necklace=add(body,new T.TorusGeometry(.14,.009,6,20,Math.PI),accent,[0,1.25,-.227],'RESIDENT_NECKLACE');necklace.rotation.z=Math.PI;
 const nameTag=box(body,[.1,.045,.018],accent,[.12,1.18,-.245],'RESIDENT_NAME_TAG');
 const highVis=new T.Group();highVis.name='RESIDENT_HIGH_VIS_VEST';body.add(highVis);const safety=material('#d8b849'),reflective=material('#d4ded7',{roughness:.45});
 for(const side of [-1,1]){box(highVis,[.14,.43,.06],safety,[side*.12,1.08,-.22]);box(highVis,[.035,.4,.018],reflective,[side*.12,1.08,-.257]);}box(highVis,[.4,.04,.07],reflective,[0,.96,-.23]);
 const hardHat=new T.Group();hardHat.name='RESIDENT_HARD_HAT';head.add(hardHat);add(hardHat,new T.SphereGeometry(.224,14,8,0,Math.PI*2,0,Math.PI/2),safety,[0,.14,.015]);add(hardHat,new T.CylinderGeometry(.25,.25,.025,16),safety,[0,.14,.015]);box(hardHat,[.04,.045,.3],reflective,[0,.34,.01]);
 const earProtection=new T.Group();earProtection.name='RESIDENT_EAR_PROTECTION';head.add(earProtection);const headband=add(earProtection,new T.TorusGeometry(.235,.015,5,20,Math.PI),dark,[0,.13,.02]);for(const side of [-1,1]){const cover=add(earProtection,new T.CylinderGeometry(.075,.075,.06,12),safety,[side*.22,.1,.015]);cover.rotation.z=Math.PI/2;}
 const nautical=new T.Group();nautical.name='RESIDENT_NAUTICAL_VEST';body.add(nautical);for(const side of [-1,1]){box(nautical,[.15,.38,.09],accent,[side*.13,1.05,-.21]);for(const y of [.94,1.09,1.22])box(nautical,[.15,.015,.01],white,[side*.13,y,-.26]);}
 const sport=new T.Group();sport.name='RESIDENT_SPORT_JERSEY';body.add(sport);for(const side of [-1,1])box(sport,[.045,.42,.027],white,[side*.17,1.08,-.23]);box(sport,[.08,.035,.022],accent,[.02,1.19,-.245]);box(sport,[.025,.15,.022],accent,[.05,1.125,-.245]);const whistle=add(sport,new T.CylinderGeometry(.025,.025,.07,8),accent,[0,1.27,-.25]);whistle.rotation.x=Math.PI/2;
 const arcade=new T.Group();arcade.name='RESIDENT_ARCADE_JACKET';body.add(arcade);for(const side of [-1,1]){box(arcade,[.035,.37,.025],accent,[side*.14,1.1,-.24]);box(arcade,[.12,.035,.025],white,[side*.14,1.27,-.245]);}const arcadeBadge=box(arcade,[.07,.07,.025],accent,[.065,1.13,-.26]);arcadeBadge.rotation.z=Math.PI/4;
 const apron=new T.Group();apron.name='RESIDENT_HOSPITALITY_APRON';body.add(apron);box(apron,[.3,.52,.035],white,[0,.98,-.24]);box(apron,[.18,.13,.045],accent,[0,.9,-.266]);
 const scarf=new T.Group();scarf.name='RESIDENT_MUSIC_SCARF';body.add(scarf);const scarfRing=add(scarf,new T.TorusGeometry(.115,.04,6,16),accent,[0,1.35,0]);scarfRing.rotation.x=Math.PI/2;box(scarf,[.095,.29,.04],accent,[-.07,1.17,-.23]);
 const toolBelt=new T.Group();toolBelt.name='RESIDENT_TOOL_BELT';body.add(toolBelt);box(toolBelt,[.45,.07,.32],dark,[0,.8,0]);for(const side of [-1,1])box(toolBelt,[.1,.14,.08],accent,[side*.2,.75,-.15]);
 const prop=new T.Group();prop.name='RESIDENT_PROP';prop.position.set(0,.95,-.31);body.add(prop);root.userData.residentProp=prop;
 box(prop,[.38,.28,.24],material('#b88c57'),[0,0,0],'crate');sphere(prop,.15,material('#df8d3d'),[0,0,0],'ball');box(prop,[.25,.34,.025],material('#d6cfac'),[0,0,0],'clipboard');
 const guitar=new T.Group();guitar.name='music';prop.add(guitar);sphere(guitar,.16,material('#ab743b'),[0,-.06,0]).scale.set(1,1,.25);box(guitar,[.045,.38,.035],dark,[0,.2,0]);
 const cardMaterial=material('#f5ead2'),red=material('#a33255'),gold=material('#d8b15c',{metalness:.5,roughness:.36});
 const cards=new T.Group();cards.name='cards';prop.add(cards);for(let i=0;i<3;i++){const card=box(cards,[.17,.24,.012],cardMaterial,[(i-1)*.1,0,-i*.012]);card.rotation.z=(i-1)*.2;const pip=box(cards,[.025,.04,.016],red,[(i-1)*.1,.03,-.022-i*.012]);pip.rotation.z=Math.PI/4;}
 const chips=new T.Group();chips.name='chips';prop.add(chips);for(let i=0;i<4;i++)add(chips,new T.CylinderGeometry(.09,.09,.035,16),i%2?gold:red,[(i%2)*.16-.08,Math.floor(i/2)*.04,0]);
 const dice=new T.Group();dice.name='dice';prop.add(dice);for(const x of [-.1,.1]){box(dice,[.14,.14,.14],cardMaterial,[x,0,0]);for(const dx of [-.025,.025])sphere(dice,.012,dark,[x+dx,.025,-.075]);}
 const tray=new T.Group();tray.name='tray';prop.add(tray);add(tray,new T.CylinderGeometry(.23,.23,.022,20),gold,[0,-.04,0]);for(const x of [-.1,.1]){add(tray,new T.CylinderGeometry(.055,.045,.17,12),material('#a7d6d2',{metalness:.12,roughness:.22}),[x,.055,0]);add(tray,new T.CylinderGeometry(.047,.047,.018,12),material('#ce7049'),[x,.145,0]);}
 for(const part of [formal,badge,radio,cap,glasses,earrings,necklace,nameTag,highVis,hardHat,earProtection,nautical,sport,apron,scarf,toolBelt,arcade])part.visible=false;
 root.userData.residentParts={body,head,hairstyles,glasses,earrings,cap,formal,badge,radio,necklace,nameTag,smile,highVis,hardHat,earProtection,nautical,sport,apron,scarf,toolBelt,arcade};
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const texture=new T.CanvasTexture(canvas),label=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true}));label.name='RESIDENT_SPEECH_LABEL';label.position.set(0,2.05,0);label.scale.set(3.1,.775,1);root.add(label);root.userData.residentLabel={canvas,texture,label,key:''};
  const worldPosition=new T.Vector3(),cameraPoint=new T.Vector3(),eye=new T.Vector3(),parentScale=new T.Vector3(),size=new T.Vector2();
  label.onBeforeRender=(renderer,_scene,camera)=>{const state=root.userData.residentState||{};label.getWorldPosition(worldPosition);camera.getWorldPosition(eye);renderer.getSize(size);cameraPoint.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);const layout=residentLabelLayout({distance:camera.isOrthographicCamera?1:Math.max(.1,-cameraPoint.z),visibilityDistance:eye.distanceTo(worldPosition),viewportWidth:size.x,viewportHeight:size.y,projectionY:camera.projectionMatrix.elements[5],speaking:Boolean(state.speaking&&state.speech)});root.getWorldScale(parentScale);label.scale.set(layout.width/Math.max(.01,parentScale.x),layout.height/Math.max(.01,parentScale.y),1);label.updateMatrixWorld(true);label.material.opacity=layout.opacity;label.userData.residentLabelLayout=layout;};
 }
 return root;
}

export function updateWorldResident(root,time){
 const state=root.userData.residentState||{},moving=state.moving,gesture=state.gesture||'work',parts=root.userData.residentParts,head=parts.head;
 const {appearance,uniform}=residentVisualStyle(state),casino=Boolean(state.casino),materials=root.userData.residentMaterials;
 materials.outfit.color.set(appearance.outfit);materials.skin.color.set(appearance.skin);materials.hair.color.set(appearance.hair);materials.accent.color.set(appearance.accent);
 const height=T.MathUtils.clamp(Number(appearance.height)||1,.9,1.12),build=T.MathUtils.clamp(Number(appearance.build)||1,.85,1.15);
 parts.body.scale.set(build,height,build);if(root.userData.residentLabel)root.userData.residentLabel.label.position.y=height*1.84+.21;
 for(const style of parts.hairstyles.children)style.visible=style.name===(['construction','security'].includes(uniform)?'short':appearance.hairstyle);
 parts.glasses.visible=appearance.accessory==='glasses';parts.earrings.visible=appearance.accessory==='earrings';parts.necklace.visible=appearance.accessory==='necklace';parts.cap.visible=uniform==='security';parts.badge.visible=uniform==='security';parts.radio.visible=uniform==='security';parts.formal.visible=uniform==='formal';parts.nameTag.visible=['formal','hospitality','training','aviation','arcade'].includes(uniform);
 parts.highVis.visible=['construction','aviation','training'].includes(uniform);parts.hardHat.visible=uniform==='construction';parts.earProtection.visible=['aviation','training'].includes(uniform);parts.nautical.visible=uniform==='nautical';parts.sport.visible=uniform==='sports';parts.apron.visible=uniform==='hospitality';parts.arcade.visible=uniform==='arcade';parts.scarf.visible=uniform==='music';parts.toolBelt.visible=uniform==='construction';
 root.getObjectByName('RESIDENT_WATCH').visible=appearance.accessory==='watch';root.traverse(node=>{if(node.name==='RESIDENT_SHIRT_CUFF')node.visible=parts.formal.visible;});
 head.rotation.set(gesture==='laugh'?Math.sin(time*8)*.1:state.speaking?Math.sin(time*7)*.035:Math.sin(time*.7)*.015,0,gesture==='laugh'?Math.sin(time*5)*.06:gesture==='listen'?.04:0);
 const look=state.lookAt||state.conversationTargetPosition;if(look&&Number.isFinite(look.x)&&Number.isFinite(look.z)){root.updateWorldMatrix(true,false);const local=root.worldToLocal(new T.Vector3(look.x,Number.isFinite(look.y)?look.y:root.getWorldPosition(new T.Vector3()).y+1.6,look.z));head.rotation.y=T.MathUtils.clamp(Math.atan2(-local.x,-local.z),-1.05,1.05);head.rotation.x+=T.MathUtils.clamp(Math.atan2(local.y-height*1.6,Math.hypot(local.x,local.z)),-.22,.22);}
 parts.smile.scale.y=state.speaking?.8+Math.sin(time*10)*.14:1;
 for(const side of [-1,1]){
  const {arm,leg}=root.userData.residentLimbs[side];leg.rotation.x=moving?Math.sin(time*6+side*Math.PI/2)*.35:0;arm.rotation.set(0,0,0);
  if(moving)arm.rotation.x=-Math.sin(time*6+side*Math.PI/2)*.3;
  else if(['wave','greet'].includes(gesture)&&side===1||gesture==='cheer'){arm.rotation.x=-2.25+Math.sin(time*6)*.15;arm.rotation.z=side===1?-.35:.35;}
  else if(gesture==='deal'){arm.rotation.x=-.95+Math.sin(time*3+side)*.3;arm.rotation.z=side*.12;}
  else if(gesture==='roll')arm.rotation.x=-.85+Math.sin(time*5+side)*.25;
  else if(['count','work','play','practise','practice'].includes(gesture))arm.rotation.x=gesture==='work'?-.8:gesture==='count'?-.9+Math.sin(time*4+side)*.12:-.65+Math.sin(time*3+side)*.2;
  else if(['serve','pass','pass-item','handshake'].includes(gesture)){arm.rotation.x=side===1?-1.15+Math.sin(time*3)*.07:-.6;arm.rotation.z=side===1?-.12:.16;}
  else if(['thought','think','listen'].includes(gesture)&&side===1){arm.rotation.x=-1.1;arm.rotation.z=-.45;}
  else if(['talk','explain'].includes(gesture)){arm.rotation.x=-.5+(Math.sin(time*3+side)*.16);arm.rotation.z=side*.13;}
 }
 const prop=root.userData.residentProp;for(const child of prop.children)child.visible=child.name===(state.prop||'crate');prop.visible=!moving&&(['working','practising','playing','serving','learning'].includes(state.phase)||['serve','pass','pass-item','deal','count','roll','practise','practice'].includes(gesture));prop.rotation.set(state.prop==='music'?-.5:gesture==='deal'?-.45+Math.sin(time*3)*.1:gesture==='roll'?Math.sin(time*5)*.2:0,0,0);prop.position.set(gesture==='deal'?Math.sin(time*3)*.12:['pass','pass-item','handshake'].includes(gesture)?.18:0,state.prop==='ball'?.3+Math.abs(Math.sin(time*4))*.5:gesture==='roll'?.95+Math.abs(Math.sin(time*5))*.08:.95,['serve','pass','pass-item'].includes(gesture)?-.55:-.31);
 const label=root.userData.residentLabel,text=state.speaking?state.speech||'':'',key=[casino,state.name,state.role,text,state.color].join('|');
 if(label&&key!==label.key){
  label.key=key;const ctx=label.canvas.getContext('2d');ctx.clearRect(0,0,768,192);ctx.fillStyle=casino?'#122331e8':'#102a31e8';ctx.fillRect(0,0,768,192);ctx.fillStyle=casino?'#efd49c':state.color||'#a6efd1';
  if(!text){let size=76;ctx.font='600 '+size+'px system-ui';while(ctx.measureText(state.name||'Guest').width>728&&size>40){size-=2;ctx.font='600 '+size+'px system-ui';}ctx.fillText(state.name||'Guest',20,120);}
  else {
   ctx.font='bold 36px system-ui';ctx.fillText((state.name||'Resident')+' · '+(state.role||'Local'),18,40);ctx.fillStyle='#f2fffa';ctx.font='38px system-ui';const words=text.split(' ');let line='',row=0;const step=44;
   for(const word of words){if(ctx.measureText(line+word).width>725){ctx.fillText(line,18,87+row*step);line='';row++;if(row>2)break;}line+=word+' ';}if(row<=2)ctx.fillText(line,18,87+row*step);
  }
  label.texture.needsUpdate=true;
 }
}
