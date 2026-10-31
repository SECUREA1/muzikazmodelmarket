import * as T from '../vendor/three/three.module.min.js';
import {FORGE_ITEMS} from './forge-items.js';

/** Metre scaled, reusable smithy models; no recipe reward is granted by rendering. */
export function createForgeModel(id){
 const info=FORGE_ITEMS[id];if(!info)return null;
 const root=new T.Group();root.name=info.name;root.userData={builderObject:true,modelId:id,forgeModel:true,dimensions:info.dimensions};
 const mat=(color,roughness=.6,metalness=.25,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
 const steel=mat('#687682',.32,.85),edge=mat('#d0d9dc',.2,.92),dark=mat('#20272b',.8,.5),bronze=mat('#b88342',.35,.8),wood=mat('#765039',.95,.02),leather=mat('#493226',.9,.03),brick=mat('#62433a',.95,.05),ember=mat('#ee7033',.8,.05,{emissive:'#fb4d19',emissiveIntensity:.8}),water=mat('#467c8a',.15,.35,{transparent:true,opacity:.82}),stone=mat('#858176',1,.02),cloth=mat('#b5a17a',1,.01);
 const mesh=(name,geometry,material,position,parent=root,rotation=[0,0,0],collide=true)=>{const value=new T.Mesh(geometry,material);value.name=name;value.position.fromArray(position);value.rotation.set(...rotation);value.castShadow=value.receiveShadow=true;value.userData.collisionDisabled=!collide;parent.add(value);return value;};
 const box=(name,size,position,material=steel,parent=root,rotation=[0,0,0],collide=true)=>mesh(name,new T.BoxGeometry(...size),material,position,parent,rotation,collide);
 const cyl=(name,radius,height,position,material=steel,parent=root,rotation=[0,0,0],collide=true)=>mesh(name,new T.CylinderGeometry(radius,radius,height,16),material,position,parent,rotation,collide);
 const sphere=(name,radius,position,material=steel,parent=root)=>mesh(name,new T.SphereGeometry(radius,12,8),material,position,parent);
 const rod=(name,a,b,radius=.04,material=steel,parent=root)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),direction=end.clone().sub(start),part=cyl(name,radius,direction.length(),start.clone().add(end).multiplyScalar(.5).toArray(),material,parent);part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());return part;};
 const shape=(name,points,depth,material,z=0)=>{const outline=new T.Shape(points.map(p=>new T.Vector2(...p))),part=mesh(name,new T.ExtrudeGeometry(outline,{depth,bevelEnabled:true,bevelSegments:1,bevelSize:.008,bevelThickness:.008}),material,[0,0,z-depth/2]);return part;};
 const rivets=(xValues,y,z,material=bronze)=>{for(const x of xValues)cyl('FORGE_PEENED_RIVET',.025,.025,[x,y,z],material,root,[Math.PI/2,0,0],false);};
 const bench=()=>{for(const x of [-1.45,1.45])for(const z of [-.53,.53])box('FORGE_BENCH_OAK_LEG',[.16,1,.16],[x,.5,z],wood);box('FORGE_BENCH_TOP',[3.4,.18,1.5],[0,1.03,0],wood);box('FORGE_BENCH_LOWER_SHELF',[3,.1,1.15],[0,.25,0],wood);};
 const ingot=(x,y,z,material=steel)=>{box('FORGE_STAMPED_INGOT',[.6,.17,.28],[x,y,z],material);box('FORGE_MAKER_MARK',[.08,.006,.09],[x,y+.088,z],bronze,root,[0,0,.2],false);};
 const hammer=(parent=root,x=0,y=0,z=0)=>{box('FORGE_ASH_HANDLE',[.065,.6,.06],[x,y+.3,z],wood,parent);box('FORGE_HAMMER_HEAD',[.4,.17,.14],[x,y+.61,z],steel,parent);for(const side of [-1,1])box('FORGE_POLISHED_STRIKING_FACE',[.02,.17,.14],[x+side*.21,y+.61,z],edge,parent);};
 if(id==='forge-stock-rack'){
  for(const x of [-1.65,1.65])for(const z of [-.58,.58])box('FORGE_STOCK_UPRIGHT',[.12,2.2,.12],[x,1.1,z],dark);
  for(const y of [.2,1,1.8]){box('FORGE_STOCK_SHELF',[3.6,.1,1.4],[0,y,0],steel);for(const x of [-1,0,1])for(const z of [-.32,.32])ingot(x,y+.14,z,y<.5?dark:y<1.5?bronze:steel);}
  for(const x of [-1,0,1])box('FORGE_STOCK_BIN_LABEL',[.42,.13,.02],[x,1.92,.72],cloth);rivets([-1.65,1.65],1,.66);
 }else if(id==='forge-hearth'){
  box('FORGE_HEARTH_PLINTH',[3.4,.35,2.4],[0,.175,0],brick);for(let row=0;row<3;row++)for(let n=0;n<6;n++)box('FORGE_REFRACTORY_BRICK',[.52,.25,.4],[-1.4+n*.55,.48+row*.27,-.82],brick);
  for(const x of [-1.45,1.45])box('FORGE_HEARTH_PIER',[.38,.9,2],[x,.78,0],brick);box('FORGE_HEARTH_FIREBED',[2.5,.2,1.6],[0,.85,0],dark);
  for(let n=0;n<20;n++){const coal=sphere('FORGE_GLOWING_COAL',.14,[-1+(n%5)*.5,.99,Math.floor(n/5)*.37-.55],n%3?dark:ember);coal.scale.y=.6;}
  box('FORGE_SMOKE_HOOD',[2.8,.32,1.8],[0,2.5,0],dark);for(const x of [-1.25,1.25])box('FORGE_HOOD_SUPPORT',[.09,1.9,.09],[x,1.55,-.78],steel);box('FORGE_HOOD_CHIMNEY',[.8,1.15,.8],[0,3.2,-.3],dark);box('FORGE_HEARTH_TOOL_LEDGE',[3.1,.12,.32],[0,1.15,1.05],steel);ingot(.2,1.04,0,ember);rivets([-1.1,-.6,0,.6,1.1],2.5,.91);
 }else if(id==='forge-bellows'){
  for(const x of [-.55,.55])for(const z of [-.7,.7])box('FORGE_BELLOWS_LEG',[.12,.7,.12],[x,.35,z],wood);
  for(const y of [.7,1.12])box('FORGE_BELLOWS_BOARD',[1.35,.1,1.8],[0,y,0],wood);for(let n=0;n<5;n++)box('FORGE_BELLOWS_LEATHER_FOLD',[1.25+n%2*.09,.06,1.65],[0,.78+n*.065,0],leather);rod('FORGE_BELLOWS_NOZZLE',[0,.9,-.8],[0,.9,-1.35],.12,dark);box('FORGE_BELLOWS_GRIP',[.7,.08,.12],[0,1.24,.85],wood);rivets([-.5,0,.5],1.13,.91);
 }else if(id==='forge-anvil'){
  cyl('FORGE_OAK_STUMP',.38,.66,[0,.33,0],wood);for(const y of [.12,.54])cyl('FORGE_STUMP_IRON_BAND',.39,.07,[0,y,0],dark);box('FORGE_ANVIL_FOOT',[.8,.13,.6],[0,.74,0],dark);box('FORGE_ANVIL_WAIST',[.4,.25,.37],[0,.93,0],steel);box('FORGE_ANVIL_FACE',[1.3,.18,.55],[.08,1.16,0],edge);mesh('FORGE_ANVIL_HORN',new T.ConeGeometry(.21,.62,16),steel,[-.82,1.12,0],root,[0,0,Math.PI/2]);box('FORGE_ANVIL_HARDY_HOLE',[.1,.008,.1],[.55,1.255,0],dark);hammer(root,.5,.04,.32);rivets([-.28,.28],.75,.32);
 }else if(id==='forge-quench-tank'){
  box('FORGE_QUENCH_BASE',[2.8,.18,1.5],[0,.2,0],dark);for(const x of [-1.32,1.32])box('FORGE_QUENCH_END',[.14,.8,1.5],[x,.65,0],steel);for(const z of [-.67,.67])box('FORGE_QUENCH_SIDE',[2.6,.8,.14],[0,.65,z],steel);box('FORGE_QUENCH_WATER',[2.45,.025,1.15],[0,.91,0],water);for(const x of [-.9,.9])for(const z of [-.45,.45])box('FORGE_QUENCH_LEG',[.14,.25,.14],[x,.125,z],dark);for(const y of [.4,.85])rivets([-1.05,-.7,0,.7,1.05],y,.75);cyl('FORGE_QUENCH_GAUGE',.12,.04,[1.15,1.15,.7],cloth,root,[Math.PI/2,0,0]);rod('FORGE_QUENCH_GAUGE_NEEDLE',[1.15,1.15,.73],[1.2,1.22,.73],.01,dark);
 }else if(id==='forge-tempering-oven'){
  box('FORGE_OVEN_FEET',[2.8,.3,1.9],[0,.15,0],dark);box('FORGE_INSULATED_OVEN',[3.2,2,2.3],[0,1.3,0],brick);box('FORGE_OVEN_DOOR',[2.5,1.5,.12],[0,1.3,1.2],steel);box('FORGE_OVEN_INSPECTION_WINDOW',[1.5,.6,.04],[-.2,1.5,1.28],ember);for(const y of [.75,1.85])box('FORGE_OVEN_HINGE',[.12,.2,.12],[-1.22,y,1.28],dark);box('FORGE_OVEN_LATCH',[.09,.45,.12],[1.05,1.25,1.35],bronze);cyl('FORGE_OVEN_TEMPERATURE_DIAL',.19,.05,[.95,1.95,1.28],cloth,root,[Math.PI/2,0,0]);rod('FORGE_OVEN_DIAL_NEEDLE',[.95,1.95,1.32],[1.04,2.03,1.32],.015,dark);for(let x=-1;x<=.6;x+=.4)box('FORGE_OVEN_VENT',[.15,.06,.02],[x,2.15,1.27],dark);
 }else if(id==='forge-grinding-wheel'){
  for(const x of [-.55,.55])for(const z of [-.4,.4])box('FORGE_WHEEL_TIMBER_LEG',[.12,1,.12],[x,.5,z],wood);box('FORGE_WHEEL_FRAME',[1.4,.12,1.1],[0,.7,0],wood);const wheel=cyl('FORGE_TREADLE_GRINDSTONE',.46,.22,[0,1.04,0],stone,root,[0,0,Math.PI/2]);wheel.userData.forgeGrindingWheel=true;cyl('FORGE_WHEEL_STEEL_AXLE',.05,1.3,[0,1.04,0],steel,root,[0,0,Math.PI/2]);box('FORGE_TREADLE',[.6,.07,.65],[.1,.2,.3],wood);rod('FORGE_TREADLE_ROD',[.56,.2,.3],[.56,.95,.15],.03,steel);box('FORGE_TOOL_REST',[.7,.07,.24],[0,1.1,.5],steel);
 }else if(id==='forge-finishing-bench'){
  bench();box('FORGE_LEATHER_WORK_SURFACE',[2.5,.025,1],[0,1.135,0],leather);box('FORGE_BENCH_TOOL_BOARD',[3.3,.8,.12],[0,1.6,-.66],wood);box('FORGE_FINISHING_VICE',[.55,.3,.4],[1.15,1.28,.4],steel);rod('FORGE_VICE_SCREW',[.8,1.3,.55],[1.6,1.3,.55],.04,dark);for(const x of [-1.2,-.7,-.2,.3]){box('FORGE_TOOL_HANDLE',[.065,.35,.06],[x,1.55,-.55],wood);box('FORGE_TOOL_HEAD',[.2,.07,.08],[x,1.75,-.55],steel);}box('FORGE_SHARPENING_STONE',[.5,.08,.2],[-.65,1.19,.25],stone);cyl('FORGE_MAKER_STAMP',.07,.22,[.1,1.25,.3],bronze);rivets([-1.4,0,1.4],1.85,-.58);
 }else if(id==='forge-coal-bin'){
  box('FORGE_COAL_BIN_BASE',[1.5,.15,1.4],[0,.075,0],wood);for(const x of [-.7,.7])box('FORGE_COAL_BIN_END',[.1,.8,1.4],[x,.47,0],wood);for(const z of [-.65,.65])box('FORGE_COAL_BIN_SIDE',[1.4,.8,.1],[0,.47,z],wood);for(let n=0;n<20;n++)sphere('FORGE_FUEL_LUMP',.15,[-.5+n%4*.32,.8+(n%3)*.04,-.45+Math.floor(n/4)*.2],dark);for(const x of [-.55,.55])box('FORGE_BIN_IRON_BRACE',[.07,.85,.04],[x,.47,.72],steel);
 }else if(id==='forge-hammer')hammer();
 else if(id==='forge-tongs'){
  for(const side of [-1,1]){rod('FORGE_TONG_HANDLE',[side*.08,.03,0],[-side*.04,.62,0],.025,dark);rod('FORGE_TONG_JAW',[-side*.04,.62,0],[side*.09,.85,0],.025,steel);rod('FORGE_TONG_JAW_TIP',[side*.09,.85,0],[side*.04,.9,0],.025,steel);}cyl('FORGE_TONG_PIVOT',.05,.09,[0,.62,0],bronze,root,[Math.PI/2,0,0]);
 }else if(['forge-iron-ingot','forge-bronze-ingot','forge-steel-billet'].includes(id)){
  ingot(0,.085,0,id==='forge-bronze-ingot'?bronze:id==='forge-iron-ingot'?dark:steel);if(id==='forge-steel-billet')for(let n=0;n<7;n++)box('FORGE_BILLET_LAYER',[.61,.005,.005],[0,.02+n*.022,.143],n%2?edge:dark);
 }else if(id==='forge-coal'){
  const sack=mesh('FORGE_CANVAS_FUEL_SACK',new T.SphereGeometry(.3,12,8),cloth,[0,.29,0]);sack.scale.set(.9,1,.7);cyl('FORGE_FUEL_SACK_NECK',.1,.15,[0,.57,0],cloth);cyl('FORGE_SACK_TIE',.105,.035,[0,.57,0],leather);sphere('FORGE_COAL_SAMPLE',.09,[.22,.08,.12],dark);box('FORGE_SACK_LABEL',[.2,.13,.015],[0,.32,-.22],dark);
 }else if(id==='forge-damascus-blade'){
  shape('FORGE_DAMASCUS_BLADE',[[-.085,.43],[-.085,1.14],[0,1.35],[.085,1.14],[.085,.43]],.045,steel);box('FORGE_BRONZE_CROSSGUARD',[.38,.07,.12],[0,.43,0],bronze);box('FORGE_BLADE_LEATHER_HILT',[.09,.3,.08],[0,.23,0],leather);sphere('FORGE_BLADE_POMMEL',.065,[0,.045,0],bronze);for(let n=0;n<15;n++){const y=.5+n*.043;rod('FORGE_FLOWING_DAMASCUS_PATTERN',[-.064,y,.028],[.064,y+.025,.028],.003,n%2?edge:dark);}for(let n=0;n<6;n++)cyl('FORGE_HILT_WRAP',.052,.016,[0,.1+n*.043,0],bronze);
 }else if(id==='forge-warhammer'){
  box('FORGE_ASH_HAFT',[.085,1.08,.08],[0,.54,0],wood);box('FORGE_FORGED_HAMMER_HEAD',[.7,.26,.26],[0,1.12,0],steel);for(const side of [-1,1])box('FORGE_HAMMER_FACE',[.045,.27,.27],[side*.35,1.12,0],edge);box('FORGE_BRONZE_CHEEK',[.35,.16,.025],[0,1.12,.15],bronze);rivets([-.12,.12],1.12,.17);for(let n=0;n<8;n++)cyl('FORGE_LEATHER_GRIP',.059,.026,[0,.12+n*.045,0],leather);
 }else if(id==='forge-battle-axe'){
  box('FORGE_AXE_HAFT',[.07,1.25,.07],[0,.625,0],wood);shape('FORGE_CRESCENT_AXE_HEAD',[[0,.9],[.22,.96],[.42,.82],[.52,1.04],[.49,1.3],[.23,1.19],[0,1.18]],.09,steel);shape('FORGE_AXE_CUTTING_BEVEL',[[.42,.82],[.52,1.04],[.49,1.3],[.46,1.22],[.48,1.04],[.4,.9]],.095,edge);box('FORGE_AXE_EYE',[.15,.3,.16],[0,1.04,0],bronze);for(let n=0;n<8;n++)cyl('FORGE_AXE_HAFT_WRAP',.05,.025,[0,.12+n*.047,0],leather);
 }else if(id==='forge-aegis-shield'){
  const points=[[-.4,.88],[-.34,1.1],[.34,1.1],[.4,.88],[.3,.35],[0,0],[-.3,.35]];shape('FORGE_SHIELD_BRONZE_RIM',points,.12,bronze);shape('FORGE_SHIELD_STEEL_FACE',points.map(([x,y])=>[x*.89,(y-.55)*.9+.55]),.14,steel,-.02);const boss=sphere('FORGE_SHIELD_BOSS',.16,[0,.65,-.095],bronze);boss.scale.z=.7;for(const y of [.38,.85])box('FORGE_SHIELD_REAR_STRAP',[.4,.055,.05],[0,y,.09],leather);for(const x of [-.27,.27])for(const y of [.5,.9])sphere('FORGE_SHIELD_RIVET',.025,[x,y,-.11],bronze);shape('FORGE_SHIELD_CREST',[[-.06,.38],[.07,.59],[.02,.59],[.09,.83],[-.08,.58],[-.025,.58]],.01,bronze,-.12);
 }else if(info.kind==='crew'){
  const skin=mat(id==='forge-metallurgist'?'#bf8f70':'#956d51',.95,.01),outfit=mat(id==='forge-metallurgist'?'#486c6b':id==='forge-quartermaster'?'#69704b':'#784937',.9,.01),hair=mat(id==='forge-master-smith'?'#908679':'#312e2a',1,.01);
  for(const side of [-1,1]){box('FORGE_SMITH_BOOT',[.2,.17,.33],[side*.15,.085,-.035],dark);box('FORGE_SMITH_TROUSER',[.18,.66,.2],[side*.15,.48,0],dark);const arm=new T.Group();arm.name='FORGE_SMITH_ARM';arm.position.set(side*.32,1.42,0);arm.userData.forgeArm=side;root.add(arm);box('FORGE_SMITH_SLEEVE',[.16,.3,.2],[0,-.16,0],outfit,arm);box('FORGE_SMITH_FOREARM',[.14,.28,.16],[0,-.43,0],skin,arm);sphere('FORGE_SMITH_HAND',.085,[0,-.58,0],skin,arm);}
  box('FORGE_SMITH_TORSO',[.55,.65,.3],[0,1.18,0],outfit);box('FORGE_LEATHER_APRON',[.47,.8,.04],[0,.97,-.18],leather);for(const side of [-1,1])rod('FORGE_APRON_STRAP',[side*.2,1.52,-.17],[side*.14,1.2,-.2],.025,leather);sphere('FORGE_SMITH_HEAD',.22,[0,1.68,0],skin);const scalp=sphere('FORGE_SMITH_HAIR',.224,[0,1.75,.035],hair);scalp.scale.y=.6;for(const side of [-1,1]){sphere('FORGE_SMITH_EYE',.022,[side*.085,1.7,-.2],dark);box('FORGE_SMITH_BROW',[.08,.025,.03],[side*.085,1.76,-.19],hair);}sphere('FORGE_SMITH_NOSE',.042,[0,1.64,-.22],skin);box('FORGE_SMITH_MOUTH',[.09,.015,.02],[0,1.57,-.205],dark);
  if(id==='forge-master-smith'){box('FORGE_SMITH_BEARD',[.27,.15,.06],[0,1.52,-.18],hair);hammer(root,.28,.63,-.17);}else if(id==='forge-metallurgist'){for(const side of [-1,1]){const ring=mesh('FORGE_SAFETY_GOGGLE',new T.TorusGeometry(.065,.015,6,16),bronze,[side*.084,1.7,-.21]);box('FORGE_GOGGLE_LENS',[.09,.06,.01],[side*.084,1.7,-.22],water);}rod('FORGE_GOGGLE_BRIDGE',[-.03,1.7,-.22],[.03,1.7,-.22],.012,dark);}else{box('FORGE_QUARTERMASTER_LEDGER',[.3,.4,.07],[.33,1,-.2],leather);box('FORGE_LEDGER_PAGES',[.25,.35,.025],[.33,1,-.245],cloth);}
 }
 // Exact dimensions give collision, portable placement and previews one contract.
 root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());
 for(const axis of ['x','y','z'])if(size[axis]>0)root.scale[axis]=info.dimensions[['x','y','z'].indexOf(axis)]/size[axis];
 root.updateMatrixWorld(true);const fitted=new T.Box3().setFromObject(root);root.position.y=-fitted.min.y;
 root.traverse(part=>{if(part.isMesh)part.userData.builderRoot=root;});root.updateMatrixWorld(true);return root;
}
export function updateForgeModel(root,elapsed=0){
 if(!root?.userData.forgeModel)return false;
 root.traverse(part=>{if(part.userData.forgeGrindingWheel&&root.userData.forgeWorking)part.rotation.x=elapsed*3;if(part.userData.forgeArm)part.rotation.x=Math.sin(elapsed*.85+part.userData.forgeArm)*.025;});return true;
}
