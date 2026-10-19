// One authored training complex for Builder, map previews and live gameplay.
// Scoring surfaces retain the positions and sizes used by range-rules.js.
export const FIRING_RANGE_ROOM_WALLS=Object.freeze([
  {name:'RANGE_BACKROOM_REAR_WALL',size:[38,3.5,.35],x:0,y:1.75,z:27.5},
  ...[-19,19].map(x=>({name:'RANGE_BACKROOM_SIDE_WALL',size:[.35,3.5,11.3],x,y:1.75,z:21.85})),
  ...[-10.5,10.5].map(x=>({name:'RANGE_BACKROOM_FRONT_WALL',size:[17,3.5,.35],x,y:1.75,z:16.2})),
  {name:'RANGE_BACKROOM_DOOR_LINTEL',size:[4,.55,.35],x:0,y:3.225,z:16.2},
  {name:'RANGE_BACKROOM_ROOF_CEILING',size:[38,.15,11.3],x:0,y:3.58,z:21.85},
  ...[[0,25],[-13,24],[13,24],[-7,20.2]].map(([x,z])=>({name:'RANGE_STATION_COUNTER',size:[3.8,.85,.9],x,y:.425,z})),
].map(definition=>Object.freeze({...definition,size:Object.freeze(definition.size)})));

export function createFiringRange(THREE, {heightAt = () => 0, settings = {}} = {}) {
  const root = new THREE.Group();
  root.name = 'MUZIKAZ_FORCE_TRAINING_RANGE';
  root.userData.firingRange = true;
  root.userData.rangeStations = [];
  const materials = new Map(), geometries = new Map(), moving = [], beams = [];
  const material = (color, glow = false) => {
    const key = `${color}:${glow}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness:.76, metalness:.16, ...(glow ? {emissive:color, emissiveIntensity:.45} : {})}));
    return materials.get(key);
  };
  const box = (name, size, x, y, z, color, {solid = true, glow = false, parent = root, rotation = 0} = {}) => {
    const key = size.join(',');
    if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(...size));
    const mesh = new THREE.Mesh(geometries.get(key), material(color, glow));
    mesh.name = name;
    mesh.position.set(x, heightAt(x,z) + y, z);
    mesh.rotation.y = rotation;
    mesh.castShadow = solid;
    mesh.receiveShadow = true;
    mesh.userData.collider = solid;
    parent.add(mesh);
    return mesh;
  };
  const sign = (text, x, y, z, width = 3, {color = '#e8c75c', parent = root} = {}) => {
    const canvas = globalThis.document?.createElement?.('canvas');
    const context = canvas?.getContext?.('2d');
    if (!context) return box(`RANGE_SIGN_${text}`, [width,.7,.06], x,y,z,0x385359,{solid:false,parent});
    canvas.width = 768; canvas.height = 192;
    context.fillStyle = '#071316'; context.fillRect(0,0,768,192);
    context.strokeStyle = color; context.lineWidth = 8; context.strokeRect(6,6,756,180);
    context.fillStyle = color; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `900 ${text.length > 25 ? 30 : 42}px sans-serif`;
    context.fillText(text,384,99,730);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map:texture,toneMapped:false,side:THREE.DoubleSide}));
    mesh.name = `RANGE_SIGN_${text}`; mesh.userData.collider = false;
    mesh.position.set(x,heightAt(x,z)+y,z); parent.add(mesh);
    return mesh;
  };
  const target = (size,x,y,z,lane,zone,color) => {
    const mesh = box(`FIRING_RANGE_TARGET_${lane+1}_${zone.toUpperCase()}`,size,x,y,z,color);
    // Hit flashes must affect only the struck plate, never every lane sharing
    // that paint colour.
    mesh.material=mesh.material.clone();
    mesh.userData.rangeTarget=true;
    mesh.userData.rangeLane=lane;
    mesh.userData.hitZone=zone;
    mesh.userData.targetHomeY=mesh.position.y;
    return mesh;
  };
  box('RANGE_BACKSTOP',[39,3.5,.5],0,1.75,-19,0x272d30);
  [-19,19].forEach(x=>box('RANGE_SIDE_WALL',[.5,3.5,38],x,1.75,0,0x252b2e));
  for (let z=-14;z<=10;z+=6) {
    box('RANGE_OVERHEAD_BAFFLE',[38,.28,1.1],0,3.3,z,0x171c1e);
    [-15,-7.5,0,7.5,15].forEach(x=>box('RANGE_WARNING_LIGHT',[.2,.15,.2],x,3.05,z,0xff334f,{solid:false,glow:true}));
  }
  [-14,-7,0,7,14].forEach((x,lane)=>{
    if(lane<4)box('RANGE_BOOTH_DIVIDER',[.18,2.35,15],x+3.5,1.175,5,0x343d40);
    box('RANGE_FIRING_BENCH',[4.6,.85,1.05],x,.425,12.5,0x20282b);
    box('RANGE_SAFE_LINE',[5.6,.04,.18],x,.025,11.2,0xe2b84b,{solid:false});
    sign(`LANE 0${lane+1}`,x,2.65,12.95,2);
    target([1.55,1.55,.08],x,1.55,-13.7,lane,'outer',0xe5dec9);
    target([1.05,1.05,.1],x,1.55,-13.62,lane,'body',0x20262a);
    target([.48,.48,.12],x,1.55,-13.54,lane,'bullseye',lane===2?0xff334f:0xe1bc43);
    const body=target([.85,1.25,.16],x,1.35,-15.45,lane,'body',lane===2?0xff334f:0x202629);
    const shoulders=target([1.4,.28,.16],x,1.72,-15.45,lane,'body',lane===2?0xff334f:0x202629);
    body.userData.reactiveTarget=true; shoulders.userData.reactiveTarget=true;
    body.userData.targetHomeX=x;shoulders.userData.targetHomeX=x;
    moving.push(body,shoulders);
    // The round outline is decorative; the server validates the fixed plates.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.69,.024,6,32),material(0xc2baa5));
    ring.name='RANGE_TARGET_OUTLINE';ring.userData.collider=false;ring.position.set(x,heightAt(x,-13.7)+1.55,-13.51);root.add(ring);
    box('RANGE_TARGET_RAIL',[.08,.08,27],x,3.18,-.7,lane===2?0x52ecff:0x566468,{solid:false});
    const beam = box('RANGE_LASER_TRACK',[.018,.018,24.6],x,1.2,-.7,0x49efff,{solid:false,glow:true});
    beam.material=beam.material.clone();beam.material.transparent=true;beam.material.opacity=.26;beams.push(beam);
    // Preserve the authored trainees as set dressing, without blocking lanes.
    const trainee = new THREE.Group();trainee.name=`RANGE_TRAINEE_${lane+1}`;trainee.userData.rangeTrainee=true;trainee.userData.collider=false;root.add(trainee);
    box('RANGE_TRAINEE_BODY',[.58,.72,.3],x,1.2,11.55,0x304438,{solid:false,parent:trainee});
    box('RANGE_TRAINEE_VEST',[.66,.42,.34],x,1.32,11.52,0x151b19,{solid:false,parent:trainee});
    box('RANGE_TRAINEE_TOOL',[.58,.1,.5],x,1.34,11.25,0x22292d,{solid:false,parent:trainee});
    [-.17,.17].forEach(offset=>box('RANGE_TRAINEE_LEG',[.15,.78,.16],x+offset,.57,11.55,0x304438,{solid:false,parent:trainee}));
    const head=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),material(0x9a7159));head.position.set(x,heightAt(x,11.55)+1.72,11.55);head.userData.collider=false;trainee.add(head);
  });
  [-8,-2,4].forEach((z,index)=>{
    box('RANGE_DISTANCE_LINE',[38,.02,.09],0,.03,z,index===1?0xe4bd43:0x748084,{solid:false});
    sign(`${[20,15,10][index]} M`,17.1,.5,z,.95);
  });
  sign('FORCE TRAINING · AUTHORIZED PERSONNEL',0,3.05,-18.72,8.8);

  const station = (id,action,label,x,z,color=0x63eaff) => {
    const group=new THREE.Group();group.name=`RANGE_STATION_${id.toUpperCase()}`;
    const entry={id,action,label,radius:2.4,enabled:settings[id]!==false,position:{x,y:Math.max(heightAt(x,z),.04),z}};
    group.userData.rangeStation=entry;root.userData.rangeStations.push(entry);root.add(group);group.visible=entry.enabled;
    box(`RANGE_${id}_SCREEN`,[1.45,.9,.12],x,1.35,z+.87,color,{solid:false,glow:true,parent:group});
    sign(label,x,2.5,z+.9,3.8,{parent:group});
    const pad=new THREE.Mesh(new THREE.RingGeometry(.7,.88,28),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide}));
    pad.name=`RANGE_ACTION_SPOT_${id.toUpperCase()}`;pad.rotation.x=-Math.PI/2;pad.position.set(x,Math.max(heightAt(x,z),.085)+.02,z-.6);pad.userData.collider=false;group.add(pad);
    return group;
  };
  {
    // The historic control room was a single solid block. Separate walls leave
    // a four-metre doorway and full standing clearance through the back room.
    box('BUILDER_WALKABLE_FLOOR_FIRING_RANGE_BACKROOM',[38,.08,11.3],0,0,21.85,0x333f43);
    for(const {name,size,x,y,z}of FIRING_RANGE_ROOM_WALLS)box(name,size,x,y,z,name.includes('COUNTER')?0x203337:0x273134);
    sign('RANGE CONTROL · MARKET & ARMORY',0,2.9,16.01,7.8);
    sign('TRAINING BACK ROOM',0,2.9,27.27,6);
    // A shared checker finish is one mesh, rather than hundreds of floor boxes.
    const tileCanvas=globalThis.document?.createElement?.('canvas'),tileContext=tileCanvas?.getContext?.('2d');
    if(tileContext){
      tileCanvas.width=tileCanvas.height=64;tileContext.fillStyle='#354247';tileContext.fillRect(0,0,64,64);tileContext.fillStyle='#253135';tileContext.fillRect(0,0,32,32);tileContext.fillRect(32,32,32,32);
      const map=new THREE.CanvasTexture(tileCanvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(19,5.65);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(37.6,11),new THREE.MeshStandardMaterial({map,roughness:.92}));floor.name='RANGE_CHECKERED_FLOOR_FINISH';floor.rotation.x=-Math.PI/2;floor.position.set(0,.085,21.85);floor.userData.collider=false;root.add(floor);
    }
    station('console','console','COURSES & QUALIFICATION',0,24.5,0xb9ff38);
    station('market','market','MARKET · WEAPONS & UPGRADES',-13,23.5,0xffcc3d);
    station('care','care','CARE · FIELD SUPPLIES',13,23.5,0xff5ba7);
    {
      station('armory','armory','ARMORY · CHOOSE EQUIPMENT',-7,19.7);
      [-8.1,-7,-5.9].forEach(x=>{box('RANGE_ARMORY_WEAPON',[.12,.12,1.3],x,1.3,20.45,0x79878d,{solid:false});box('RANGE_ARMORY_GRIP',[.12,.35,.16],x,1.1,20.4,0x12191c,{solid:false});});
    }
    root.userData.rangeBackroom={min:{x:-18.8,z:16.4},max:{x:18.8,z:27.3},door:{x:0,z:16.2,width:4,height:2.95}};
  }
  root.userData.updateRangeEffects=(time,reducedMotion=false)=>{
    const animate=settings.movingTargets!==false&&!reducedMotion;
    for(const mesh of moving)mesh.position.x=mesh.userData.targetHomeX+(animate?Math.sin(time*.7+mesh.userData.rangeLane)*1.1:0);
    for(let index=0;index<beams.length;index++)beams[index].material.opacity=reducedMotion?.26:.26+Math.sin(time*3+index)*.08;
  };
  return root;
}
