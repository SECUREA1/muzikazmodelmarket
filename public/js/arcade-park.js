import * as T from '../vendor/three/three.module.min.js';
import {ARCADE_PARTS,ARCADE_ATTRACTIONS,arcadeSettings} from './arcade-rules.js';

// Animation data stays outside userData so builder scenes remain JSON serializable.
const contexts=new WeakMap();
const descriptors=new Map(ARCADE_PARTS.map(part=>[part.id,part]));
const attractionIndex=id=>ARCADE_ATTRACTIONS.findIndex(part=>part.id===id);
function helpers(parent,accent){
 const material=color=>{const tint=color==='accent';const m=new T.MeshStandardMaterial({color:tint?accent:color,roughness:.6});m.userData.arcadeTint=tint;return m;};
 function box(x,y,z,w,h,d,color,target=parent){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;target.add(mesh);return mesh;}
 function ball(x,y,z,r,color,target=parent){const mesh=new T.Mesh(new T.SphereGeometry(r,16,12),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;target.add(mesh);return mesh;}
 function label(text,x,y,z,target=parent){if(typeof document==='undefined')return null;const canvas=document.createElement('canvas');canvas.width=512;canvas.height=100;const ctx=canvas.getContext('2d');if(!ctx)return null;ctx.fillStyle='#172928';ctx.fillRect(0,0,512,100);ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.strokeRect(2,2,508,96);ctx.fillStyle='#ffffff';ctx.font='bold 35px Arial';ctx.textAlign='center';ctx.fillText(text,256,63);const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),color:accent}));sprite.material.userData.arcadeTint=true;sprite.position.set(x,y,z);sprite.scale.set(7,1.37,1);sprite.name='ARCADE_LABEL_'+text.replaceAll(' ','_');target.add(sprite);return sprite;}
 function rail(points,width=.07){const curve=new T.CatmullRomCurve3(points);const mesh=new T.Mesh(new T.TubeGeometry(curve,120,width,5,false),material('accent'));mesh.material.emissive.set(accent);mesh.material.emissiveIntensity=.25;parent.add(mesh);return mesh;}
 return {box,ball,label,rail,material};
}
function tree(parent,h,index=0){const group=new T.Group();group.name='ARCADE_TREE_'+index;h.box(0,.5,0,.18,1,.18,'#796b4e',group);const cone=new T.Mesh(new T.ConeGeometry(.75,2,7),h.material('accent'));cone.position.y=1.8;cone.castShadow=true;group.add(cone);parent.add(group);return group;}
function lamp(parent,h,index=0){const group=new T.Group();group.name='ARCADE_LAMP_'+index;h.box(0,1.5,0,.1,3,.1,'accent',group);const globe=h.ball(0,3,0,.23,'#eff7b3',group);globe.material.emissive.set('#eff7b3');globe.material.emissiveIntensity=.45;parent.add(group);return group;}
function bench(parent,h,index=0){const group=new T.Group();group.name='ARCADE_BENCH_'+index;h.box(0,.55,0,2,.15,.65,'accent',group);h.box(0,1,-.3,2,.65,.12,'accent',group);for(const x of [-.75,.75])h.box(x,.25,0,.12,.55,.55,'#263b36',group);parent.add(group);return group;}
function trainVehicle(parent,h,index=0){const group=new T.Group();group.name=index?'ARCADE_TRAIN_CARRIAGE_'+index:'ARCADE_TRAIN_ENGINE';h.box(0,.65,0,1.1,.9,1.8,'accent',group);h.box(0,index?1.85:1.2,.2,1.2,.18,1.5,'#253e36',group);if(!index)h.box(0,1.35,-.65,.3,.6,.3,'#dcca91',group);else{h.box(0,1.12,.55,1,.12,.45,'#786846',group);h.box(0,1.12,-.45,1,.12,.45,'#786846',group);}for(const x of [-.6,.6])for(const z of [-.55,.55])h.ball(x,.25,z,.22,'#172526',group);parent.add(group);return group;}
function safetyBar(parent,h,color='accent'){const group=new T.Group();group.name='ARCADE_SAFETY_BAR';h.box(0,.45,0,1.1,.1,.1,color,group);for(const side of [-1,1])h.box(side*.5,.225,0,.07,.45,.07,color,group);parent.add(group);return group;}
function cylinder(parent,h,radiusTop,radiusBottom,height,color,x=0,y=height/2,z=0,segments=24){const mesh=new T.Mesh(new T.CylinderGeometry(radiusTop,radiusBottom,height,segments),h.material(color));mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
function equipment(parent,id,h){
 const root=new T.Group();root.name='ARCADE_EQUIPMENT_'+id.toUpperCase().replaceAll('-','_');parent.add(root);
 if(id==='basketball-hoop'){h.box(0,1.25,-.15,.12,2.5,.12,'#d1d4c0',root);h.box(0,2.7,0,1.8,1.2,.15,'#dae5cf',root);const ring=new T.Mesh(new T.TorusGeometry(.4,.045,8,24),h.material('accent'));ring.rotation.x=Math.PI/2;ring.position.set(0,2.3,.4);root.add(ring);const net=new T.Mesh(new T.CylinderGeometry(.35,.24,.5,12,4,true),h.material('#e5e8d8'));net.material.wireframe=true;net.position.set(0,2.03,.4);root.add(net);}
 if(id==='basketball-ball'){h.ball(0,.35,0,.35,'accent',root);for(const angle of [0,Math.PI/2]){const seam=new T.Mesh(new T.TorusGeometry(.351,.009,4,32),h.material('#755239'));seam.rotation.y=angle;seam.position.y=.35;root.add(seam);}const seam=new T.Mesh(new T.TorusGeometry(.351,.009,4,32),h.material('#755239'));seam.rotation.x=Math.PI/2;seam.position.y=.35;root.add(seam);}
 if(id==='hockey-goal'){for(const side of [-1,1]){h.box(side*.8,.55,0,.06,1.1,.06,'accent',root);h.box(side*.8,.4,-.65,.06,.8,.06,'accent',root);h.box(side*.8,.03,-.325,.06,.06,.65,'accent',root);}h.box(0,1.1,0,1.66,.06,.06,'accent',root);h.box(0,.8,-.65,1.66,.06,.06,'accent',root);for(let i=0;i<9;i++)h.box(-.8+i*.2,.4,-.65,.018,.8,.018,'#e5e8d8',root);for(let i=0;i<5;i++)h.box(0,i*.2,-.65,1.6,.018,.018,'#e5e8d8',root);}
 if(id==='hockey-puck')cylinder(root,h,.18,.18,.1,'accent');
 if(id==='air-hockey-mallet'){cylinder(root,h,.3,.32,.1,'accent');cylinder(root,h,.09,.13,.24,'accent',0,.22,0);}
 if(id==='billiard-cue'){const shaft=cylinder(root,h,.025,.04,3.7,'accent',0,.08,0);shaft.rotation.z=Math.PI/2;const ferrule=cylinder(root,h,.027,.027,.15,'#e9e5d0',-1.9,.08,0);ferrule.rotation.z=Math.PI/2;const tip=cylinder(root,h,.027,.027,.05,'#486771',-2,.08,0);tip.rotation.z=Math.PI/2;}
 if(id==='billiard-balls'){for(let j=0;j<6;j++)h.ball(Math.sin(j)*.5,.13,Math.cos(j)*.5,.13,['accent','#b092d7','#e7956c','#79c8cf','#d2e881','#eea06e'][j],root);h.ball(-.9,.13,0,.13,'#e8eee0',root);}
 if(id==='arcade-target'){h.box(0,.75,-.05,.1,1.5,.1,'#738b79',root);const target=cylinder(root,h,.75,.75,.12,'accent',0,1.75,0,32);target.rotation.x=Math.PI/2;for(const [radius,color,z] of [[.48,'#eae6d2',.075],[.22,'#cd626c',.09]]){const disc=cylinder(root,h,radius,radius,.025,color,0,1.75,z,32);disc.rotation.x=Math.PI/2;}}
 if(id==='train-engine')trainVehicle(root,h,0);
 if(id==='rail-segment'){for(const x of [-.28,.28])h.box(x,.2,0,.09,.14,4,'accent',root);for(let i=0;i<9;i++)h.box(0,.08,-1.8+i*.45,.9,.1,.18,'#4b6557',root);}
 if(id==='coaster-support'){h.box(0,3,0,.16,6,.16,'accent',root);h.box(0,.06,0,.8,.12,.8,'#8f9e88',root);h.box(0,6,0,1.1,.08,.14,'#e4bcb0',root);}
 if(id==='safety-bar')safetyBar(root,h);
 return root;
}
function coasterCar(parent,h){const group=new T.Group();group.name='ARCADE_COASTER_CAR';h.box(0,.28,0,1,.55,1.6,'accent',group);h.box(0,.45,-.5,.95,.9,.25,'#78575b',group);safetyBar(group,h,'#253e36').position.set(0,.41,.12);parent.add(group);return group;}
function pick(mesh,index,root){mesh.userData.index=index;mesh.userData.arcadeAttraction=ARCADE_ATTRACTIONS[index].id;mesh.userData.arcadePart=root.userData.arcadePart;return mesh;}
function buildStation(root,id,h,context){const index=attractionIndex(id),attraction=ARCADE_ATTRACTIONS[index];
 const platform=h.box(0,.24,0,9,.35,7,'#344c45');platform.name='ARCADE_'+id.toUpperCase().replaceAll('-','_')+'_BOARDING';context.clickMeshes.push(pick(platform,index,root));h.box(0,.48,0,8.4,.12,6.4,'accent');h.label(attraction.name.toUpperCase(),0,4.2,-3);for(const side of [-1,1])h.box(side*4,1,-3,.12,2,.12,'#718c7a');
 if(id==='hockey'){h.box(0,.59,0,8,.12,6,'#b8e1dc');h.box(0,.67,0,.06,.03,6,'#db747d');const ring=new T.Mesh(new T.RingGeometry(1.05,1.1,40),h.material('#d57782'));ring.rotation.x=-Math.PI/2;ring.position.set(0,.68,0);root.add(ring);for(const side of [-1,1]){const goal=equipment(root,'hockey-goal',h);goal.position.set(side*3.4,.65,0);goal.rotation.y=-side*Math.PI/2;}equipment(root,'hockey-puck',h).position.set(1,.65,0);}
 if(id==='shooting'){h.box(0,.7,0,8,.3,5.8,'#3c3d4a');for(let j=0;j<3;j++)equipment(root,'arcade-target',h).position.set(-2.5+j*2.5,.45,-2);h.box(0,1,2.1,8,.7,.4,'#625c66');}
 if(id==='basketball'){h.box(0,.58,0,8,.12,6,'#be8756');h.box(0,.67,0,.05,.03,6,'#f6ddb2');for(const side of [-1,1]){const hoop=equipment(root,'basketball-hoop',h);hoop.position.set(side*3.5,0,0);hoop.rotation.y=-side*Math.PI/2;}equipment(root,'basketball-ball',h).position.set(1,.6,0);}
 if(id==='air-hockey'||id==='billiards'){const air=id==='air-hockey';h.box(0,1.05,0,6,.7,3.5,'accent');h.box(0,1.45,0,5.5,.1,3,air?'#c2e7e0':'#4b9176');for(const x of [-1,1])for(const z of [-1,1])h.box(x*2.3,.5,z*1.1,.25,1,.25,'#263b36');if(air){for(const x of [-1,1])equipment(root,'air-hockey-mallet',h).position.set(x,1.51,0);}else{equipment(root,'billiard-balls',h).position.y=1.5;equipment(root,'billiard-cue',h).position.set(0,1.5,-1.25);}}
}
function buildTrain(root,h,context,config){
 const curve=new T.CatmullRomCurve3(Array.from({length:33},(_,i)=>{const angle=i/32*Math.PI*2;return new T.Vector3(config.trainRadiusX*Math.cos(angle),.4,config.trainRadiusZ*Math.sin(angle));}),true);context.localTrainCurve=curve;
 for(const offset of [-.28,.28])h.rail(Array.from({length:161},(_,i)=>{const point=curve.getPoint(i/160),tangent=curve.getTangent(i/160);return point.add(new T.Vector3(tangent.z*offset,0,-tangent.x*offset));}));
 for(let i=0;i<150;i++){const point=curve.getPoint(i/150),mesh=h.box(point.x,.21,point.z,.9,.1,.18,'#4b6557');mesh.rotation.y=-Math.atan2(curve.getTangent(i/150).z,curve.getTangent(i/150).x);mesh.name='ARCADE_RAIL_SLEEPER_'+i;}
 for(let i=0;i<4;i++)context.trains.push(trainVehicle(root,h,i));
 const pad=h.box(12,.15,8,3,.25,3,'accent');pad.name='ARCADE_TRAIN_BOARDING';context.clickMeshes.push(pick(pad,5,root));
}
function buildCoaster(root,h,context,config){
 const points=[[19,1.8,9],[20,6,2],[15,13,-10],[4,8,-14],[-9,3,-13],[-19,7,-4],[-17,11,9],[-5,5,13],[8,3,13]].map(([x,y,z])=>new T.Vector3(x*config.coasterWidth/39,1.8+(y-1.8)*(config.coasterPeak-1.8)/11.2,z*config.coasterDepth/27));
 const curve=new T.CatmullRomCurve3(points,true);context.localCoaster=curve;
 for(const offset of [-.4,.4])h.rail(Array.from({length:301},(_,i)=>{const point=curve.getPointAt(i/300),tangent=curve.getTangentAt(i/300);return point.add(new T.Vector3(tangent.z*offset,0,-tangent.x*offset));}),.095);
 for(let i=0;i<90;i++){const point=curve.getPointAt(i/90),tangent=curve.getTangentAt(i/90),mesh=h.box(point.x,point.y,point.z,1.1,.08,.14,'#e4bcb0');mesh.rotation.y=Math.atan2(tangent.x,tangent.z)+Math.PI/2;if(i%4===0){h.box(point.x,point.y/2,point.z,.16,point.y,.16,'#536b62');h.box(point.x,0,point.z,.8,.12,.8,'#8f9e88');}}
 context.cart=coasterCar(root,h);h.label('SKYLINE',20*config.coasterWidth/39,5,0);const pad=h.box(20*config.coasterWidth/39,.15,0,3,.25,3,'accent');pad.name='ARCADE_COASTER_BOARDING';context.clickMeshes.push(pick(pad,6,root));
}
function buildScenery(root,id,h,config){
 if(id==='ground'){const width=Math.max(53,config.trainRadiusX*2+5,config.coasterWidth+8),depth=Math.max(37,config.trainRadiusZ*2+5,config.coasterDepth+8);h.box(0,-.8,0,width,1.5,depth,'accent');h.box(0,-1.7,0,width+1,.5,depth+1,'#0c2522');}
 if(id==='paths'){h.box(0,.02,0,41,.1,3,'accent');h.box(0,.02,0,3,.1,26,'accent');for(const z of [-15,15])h.box(0,.05,z,44,.12,1,'accent');for(const x of [-22,22])h.box(x,.05,0,1,.12,30,'accent');}
 if(id==='trees'){for(let i=0;i<35;i++){const angle=i*2.4,x=Math.sin(angle)*20,z=Math.cos(angle*.7)*13;if(Math.abs(x)<4||Math.abs(z)<3||ARCADE_ATTRACTIONS.slice(0,5).some(a=>{const p=config.placements[a.id];return Math.abs(x-p.x)<(Math.abs(Math.cos(p.rotation*Math.PI/180))*4.5+Math.abs(Math.sin(p.rotation*Math.PI/180))*3.5)*p.scale+1&&Math.abs(z-p.z)<(Math.abs(Math.sin(p.rotation*Math.PI/180))*4.5+Math.abs(Math.cos(p.rotation*Math.PI/180))*3.5)*p.scale+1;}))continue;tree(root,h,i).position.set(x,0,z);}}
 if(id==='lamps'){let i=0;for(const x of [-20,-7,7,20])for(const z of [-3,3])lamp(root,h,i++).position.set(x,0,z);}
 if(id==='benches'){let i=0;for(const x of [-6,6])for(const z of [-3,3]){const seat=bench(root,h,i++);seat.position.set(x,0,z);if(z>0)seat.rotation.y=Math.PI;}}
 if(id==='fountain'){h.box(0,.4,0,3.4,.5,3.4,'#7f8d6d');const water=h.ball(0,1.1,0,1.1,'accent');water.scale.y=.35;}
 if(id==='train-station'){h.box(0,.7,0,7,1,4,'#58684b');h.box(0,3,0,8,.3,4.5,'accent');for(const x of [-3,3])h.box(x,1.7,0,.15,2.5,.15,'#a3b978');h.label('PARK EXPRESS',0,4.2,0);}
 if(id==='signs'){for(const x of [-2.7,2.7])h.box(x,1.6,-.1,.12,3.2,.12,'#718c7a');h.box(0,3.2,-.1,7,1.37,.12,'accent');h.label('NEON JUNCTION',0,3.2,0);}
 if(id==='tree')tree(root,h);
 if(id==='lamp')lamp(root,h);
 if(id==='bench')bench(root,h);
 if(id==='path')h.box(0,.05,0,3,.1,3,'accent');
 if(id==='sign'){h.box(0,1.5,-.1,.12,3,.12,'#718c7a');h.box(0,3,-.1,7,1.37,.12,'accent');h.label('NEON JUNCTION',0,3,0);}
 if(id==='train-carriage')trainVehicle(root,h,1);
 if(id==='coaster-car')coasterCar(root,h);
 if(descriptors.get(id)?.category==='Equipment props')equipment(root,id,h);
}
function transform(root,options){root.position.set(options.x||0,0,options.z||0);root.rotation.y=(options.rotation||0)*Math.PI/180;root.scale.setScalar(options.scale||1);root.visible=options.enabled!==false;root.userData.arcadeColor=options.color;root.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:[node.material])if(material?.userData.arcadeTint)material.color.set(options.color);});root.updateMatrixWorld(true);}
function curveView(curve,assembly,reference=null){
 const convert=point=>{assembly.updateWorldMatrix(true,false);assembly.localToWorld(point);if(reference){reference.updateWorldMatrix(true,false);reference.worldToLocal(point);}return point;};
 const point=(method,t,target)=>{const result=convert(curve[method](t));return target?target.copy(result):result;};
 const tangent=(method,t,target)=>{const direction=curve[method](t),start=convert(new T.Vector3()),end=convert(direction);end.sub(start).normalize();return target?target.copy(end):end;};
 return {getPoint:(t,target)=>point('getPoint',t,target),getPointAt:(t,target)=>point('getPointAt',t,target),getTangent:(t,target)=>tangent('getTangent',t,target),getTangentAt:(t,target)=>tangent('getTangentAt',t,target)};
}
function makePart(id,config,options={}){const definition=descriptors.get(id);if(!definition)throw new Error('Unknown arcade part: '+id);const root=new T.Group();root.name='ARCADE_PART_'+id.toUpperCase().replaceAll('-','_');root.userData={arcadePart:id,arcadePartName:definition.name};if(definition.attraction){root.userData.arcadeAttraction=definition.attraction;root.userData.attractionId=definition.attraction;root.userData.index=attractionIndex(id);}const context={root,config,trains:[],cart:null,clickMeshes:[],parts:{}};contexts.set(root,context);const settings={enabled:true,x:0,z:0,rotation:0,scale:1,color:definition.color,...options};const h=helpers(root,settings.color);if(attractionIndex(id)>=0&&attractionIndex(id)<5)buildStation(root,id,h,context);else if(id==='train')buildTrain(root,h,context,config);else if(id==='coaster')buildCoaster(root,h,context,config);else buildScenery(root,id,h,config);transform(root,settings);return root;}
/** Build one origin-centered palette item without allocating the entire park. */
export function createArcadePart(id,options={}){const config=arcadeSettings(options.arcade||{}),definition=descriptors.get(id);if(!definition)throw new Error('Unknown arcade part: '+id);const clean=arcadeSettings({parts:{[id]:options}}).parts[id];const direct=clean||{enabled:options.enabled!==false,x:Number.isFinite(options.x)?options.x:0,z:Number.isFinite(options.z)?options.z:0,rotation:Number.isFinite(options.rotation)?Math.max(-180,Math.min(180,options.rotation)):0,scale:Number.isFinite(options.scale)?Math.max(.5,Math.min(1.75,options.scale)):1,color:/^#[0-9a-f]{6}$/i.test(options.color||'')?options.color:definition.color};return makePart(id,config,{...direct,x:options.x===undefined?0:direct.x,z:options.z===undefined?0:direct.z});}
/** Curves for individual placed rides follow all ancestor transforms. */
export function getArcadePartRuntime(root){const context=contexts.get(root);if(!context)return null;root.updateWorldMatrix(true,false);return {...context,rideUp:new T.Vector3(0,1,0).transformDirection(root.matrixWorld),rideScale:root.getWorldScale(new T.Vector3()).y,trainCurve:context.localTrainCurve?curveView(context.localTrainCurve,root):undefined,coaster:context.localCoaster?curveView(context.localCoaster,root):undefined};}
export function createArcadePark(raw={}){
 const config=arcadeSettings(raw),root=new T.Group();root.name='NEON_JUNCTION_ARCADE_PARK';root.userData.arcadePark=true;const park={root,config,parts:{},trains:[],cart:null,clickMeshes:[]};contexts.set(root,park);
 for(const definition of ARCADE_PARTS.filter(p=>!p.placeableOnly)){const id=definition.id,part=makePart(id,config,config.parts[id]);root.add(part);park.parts[id]=part;const context=contexts.get(part);park.clickMeshes.push(...context.clickMeshes);if(id==='train'){park.trainCurve=curveView(context.localTrainCurve,part,root);park.trains=context.trains;}if(id==='coaster'){park.coaster=curveView(context.localCoaster,part,root);park.cart=context.cart;}}
 root.updateMatrixWorld(true);return park;
}
/** Update assembly transform, visibility and accent color without replacing its animation state. */
export function updateArcadeParkPart(root,id,raw={}){const context=contexts.get(root),part=context?.parts[id];if(!part)return false;const settings=arcadeSettings(raw);transform(part,settings.parts[id]);return true;}
export function animateArcadePart(root,elapsed,raw){
 const context=contexts.get(root);if(!context)return null;elapsed=Number.isFinite(Number(elapsed))?Number(elapsed):0;const config=arcadeSettings(raw??context.config),wrap=value=>((value%1)+1)%1,trainT=wrap(elapsed/config.trainLapSeconds),coasterT=wrap(elapsed/config.coasterLapSeconds);
 if(context.localTrainCurve)context.trains.forEach((vehicle,index)=>{const t=wrap(trainT-index*.017);vehicle.position.copy(context.localTrainCurve.getPointAt(t));vehicle.lookAt(root.localToWorld(context.localTrainCurve.getPointAt(wrap(t+.002))));});
 if(context.localCoaster&&context.cart){context.cart.position.copy(context.localCoaster.getPointAt(coasterT));context.cart.lookAt(root.localToWorld(context.localCoaster.getPointAt(wrap(coasterT+.002))));}
 return {trainT,coasterT};
}
export function animateArcadePark(root,elapsed,raw){const context=contexts.get(root);if(!context)return null;if(context.parts&&Object.keys(context.parts).length){for(const part of Object.values(context.parts)){const item=contexts.get(part);if(item.localTrainCurve||item.localCoaster)animateArcadePart(part,elapsed,raw);}const config=arcadeSettings(raw??context.config),wrap=value=>((value%1)+1)%1;elapsed=Number.isFinite(Number(elapsed))?Number(elapsed):0;return {trainT:wrap(elapsed/config.trainLapSeconds),coasterT:wrap(elapsed/config.coasterLapSeconds)};}return animateArcadePart(root,elapsed,raw);}
