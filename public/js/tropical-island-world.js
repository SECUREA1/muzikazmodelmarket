import * as T from '../vendor/three/three.module.min.js';

// One authored island, shared by the walking camera, resort map and boat controls.
// All coordinates are world metres. The sandy/grass floor stays flat at y=.36.
export function islandShoreRadius(angle) {
  return 1 + .045 * Math.sin(angle * 5 + .4) + .035 * Math.cos(angle * 3 - .8);
}
export function isIslandLand(x, z) {
  const angle = Math.atan2(z / 34, x / 45);
  return Math.hypot(x / 45, z / 34) <= islandShoreRadius(angle);
}

export function createTropicalIslandWorld() {
  const root = new T.Group(); root.name = 'TROPICAL_ISLAND_RESORT';
  const materials = new Map(), geometries = new Set(), textures = new Set();
  const cube = new T.BoxGeometry(1, 1, 1), sphere = new T.SphereGeometry(1, 12, 8);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 10);
  [cube, sphere, cylinder].forEach(g => geometries.add(g));
  const colliders = [], palms = [], flags = [], floats = [], birds = [], clouds = [], guests = [], fish = [];
  function grainTexture(kind) {
    const size=64,data=new Uint8Array(size*size*4);
    for(let z=0;z<size;z++)for(let x=0;x<size;x++){
      const noise=(Math.sin(x*127.1+z*311.7)*43758.5453)%1;
      let value=242+Math.abs(noise)*13;
      if(kind==='thatch')value=211+Math.abs(Math.sin(x*2.2+Math.sin(z*.14)*.7))*25+(z%8===0?-24:8)+Math.abs(noise)*8;
      else if(kind==='stone')value=235+Math.abs(noise)*15-((x+Math.floor(z/16)*11)%32===0||z%16===0?18:0);
      const i=(z*size+x)*4;data[i]=value;data[i+1]=Math.max(0,value-(kind==='thatch'?8:1));data[i+2]=Math.max(0,value-(kind==='thatch'?20:4));data[i+3]=255;
    }
    const texture=new T.DataTexture(data,size,size,T.RGBAFormat);
    texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;textures.add(texture);return texture;
  }
  const sandGrain=grainTexture('sand'),pathGrain=grainTexture('stone'),thatchGrain=grainTexture('thatch');
  thatchGrain.repeat.set(5,3);
  const shadowData=new Uint8Array(32*32*4);
  for(let z=0;z<32;z++)for(let x=0;x<32;x++){
    const r=Math.hypot((x-15.5)/15.5,(z-15.5)/15.5),i=(z*32+x)*4;
    shadowData[i+3]=Math.round(Math.pow(Math.max(0,1-r),1.5)*58);
  }
  const shadowTexture=new T.DataTexture(shadowData,32,32,T.RGBAFormat);shadowTexture.needsUpdate=true;
  shadowTexture.magFilter=T.LinearFilter;shadowTexture.minFilter=T.LinearFilter;textures.add(shadowTexture);
  const shadowGeometry=new T.PlaneGeometry(1,1);geometries.add(shadowGeometry);
  const shadowMaterial=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  materials.set('contact-shadow',shadowMaterial);
  const material = (color, options = {}) => {
    const key = color + JSON.stringify({...options,map:options.map?.uuid});
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({color, roughness: .8, ...options}));
    return materials.get(key);
  };
  function mesh(name, geometry, color, parent = root, options = {}) {
    const m = new T.Mesh(geometry, material(color, options)); m.name = name;
    m.receiveShadow = true; parent.add(m); return m;
  }
  function box(name, x, y, z, w, h, d, color, parent = root, options) {
    const m = mesh(name, cube, color, parent, options); m.position.set(x, y, z); m.scale.set(w, h, d); return m;
  }
  function ball(name, x, y, z, r, color, parent = root) {
    const m = mesh(name, sphere, color, parent); m.position.set(x, y, z); m.scale.setScalar(r); return m;
  }
  function cyl(name, x, y, z, r, h, color, parent = root) {
    const m = mesh(name, cylinder, color, parent); m.position.set(x, y, z); m.scale.set(r, h, r); return m;
  }
  function group(name, x, z, angle = 0, parent = root) {
    const g = new T.Group(); g.name = name; g.position.set(x, .36, z); g.rotation.y = angle; parent.add(g); return g;
  }
  function contactShadow(parent,x,z,w,d,localY=.062){
    const m=new T.Mesh(shadowGeometry,shadowMaterial);m.name='SOFT_CONTACT_SHADOW';
    m.rotation.x=-Math.PI/2;m.position.set(x,localY,z);m.scale.set(w,d,1);m.renderOrder=1;parent.add(m);return m;
  }
  function barBetween(name, a, b, radius, color, parent = root) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
    const m = cyl(name, 0, 0, 0, radius, delta.length(), color, parent);
    m.position.copy(start.add(end).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  function label(text, x, y, z, width = 7, parent = root, color = '#173b43') {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 144;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(2, 2, 764, 140, 28); ctx.fill();
    ctx.strokeStyle = '#fff1cc'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#fff8df'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 56px system-ui, sans-serif'; ctx.fillText(text, 384, 72, 720);
    const sprite = new T.Sprite(new T.SpriteMaterial({map: new T.CanvasTexture(canvas), depthWrite: false}));
    sprite.position.set(x, y, z); sprite.scale.set(width, width * 144 / 768, 1); parent.add(sprite); return sprite;
  }
  function terrain(name, rx, rz, y, color, factor = 1, options) {
    const vertices = [0, y, 0], uvs=[0,0], count = 120, indices = [];
    for (let i = 0; i <= count; i++) {
      const a = i / count * Math.PI * 2, r = islandShoreRadius(a) * factor;
      vertices.push(Math.cos(a) * rx * r, y, Math.sin(a) * rz * r);
      uvs.push(Math.cos(a)*rx*r/4,Math.sin(a)*rz*r/4);
      if (i < count) indices.push(0, i + 2, i + 1);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices); geo.computeVertexNormals(); geometries.add(geo);
    return mesh(name, geo, color, root, options);
  }
  function shoreLine(factor, y, color, opacity, width) {
    const verts = [], indices = [], count = 120;
    for (let i = 0; i <= count; i++) {
      const a = i / count * Math.PI * 2, r = islandShoreRadius(a);
      for (const spread of [0, width]) verts.push(Math.cos(a) * (45 * factor + spread) * r, y, Math.sin(a) * (34 * factor + spread) * r);
      if (i < count) {const j = i * 2; indices.push(j, j + 3, j + 1, j, j + 2, j + 3);}
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices); geo.computeVertexNormals(); geometries.add(geo);
    return mesh('SHORE_BREAK', geo, color, root, {transparent: true, opacity, depthWrite: false, side: T.DoubleSide});
  }
  const water = box('CARIBBEAN_SEA', 0, -.25, 0, 480, .1, 480, '#07899d', root, {roughness: .36, metalness: .15});
  terrain('TURQUOISE_SHALLOWS', 58, 44, -.18, '#35c7bc');
  terrain('LAGOON_SAND', 50, 39, -.12, '#64dfc7');
  terrain('WET_SAND', 46.1, 34.9, .03, '#e4d2a1',1,{map:sandGrain});
  terrain('PEARL_BEACH', 45, 34, .36, '#f2dfad',1,{map:sandGrain});
  terrain('RESORT_GARDENS', 31, 23.5, .375, '#8ebd6e');
  terrain('GARDEN_INTERIOR', 27, 20, .385, '#9fc47b');
  const foam = [shoreLine(1.04, .055, '#e8fff1', .75, .23), shoreLine(1.115, -.02, '#d3fff0', .52, .12)];
  for(let i=0;i<74;i++){
    const a=i*2.399,r=1.25+(i%6)*.22,x=Math.cos(a)*48*r,z=Math.sin(a)*38*r;
    const ripple=box('TRADEWIND_WATER_RIPPLE',x,-.16,z,1.2+(i%4)*.65,.012,.065,'#a3e8dd',root,{transparent:true,opacity:.32,depthWrite:false});ripple.rotation.y=-.3;
  }
  function path(points, width = 2.8) {
    const curve = new T.CatmullRomCurve3(points.map(([x, z]) => new T.Vector3(x, .405, z)));
    const length=curve.getLength();
    function ribbon(w,y,color,options){
      const vertices=[],uvs=[],indices=[];
      for (let i = 0; i <= 80; i++) {
        const p = curve.getPointAt(i / 80), tangent = curve.getTangentAt(i / 80);
        const normal = new T.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(w / 2);
        vertices.push(p.x + normal.x, y, p.z + normal.z, p.x - normal.x, y, p.z - normal.z);
        uvs.push(0,i/80*length/3,w/3,i/80*length/3);
        if (i < 80) {const j = i * 2; indices.push(j, j + 1, j + 3, j, j + 3, j + 2);}
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();geometries.add(g);
      mesh('SANDSTONE_WALKWAY',g,color,root,{side:T.DoubleSide,...options});
    }
    ribbon(width+.32,.407,'#c9ad7f');ribbon(width,.414,'#e9ce9c',{map:pathGrain});
    for(let i=1;i<Math.floor(length/3.9);i++){
      const p=curve.getPointAt(i*3.9/length),t=curve.getTangentAt(i*3.9/length),sign=i%2?1:-1;
      const x=p.x-t.z*(width/2+.48)*sign,z=p.z+t.x*(width/2+.48)*sign;
      if(!isIslandLand(x,z))continue;
      const stone=box('PATH_SHOULDER_STONE',x,.415,z,.52,.065,.38,i%3?'#d6bc92':'#e2ccaa');stone.rotation.y=Math.atan2(t.x,t.z)+i*.3;
    }
  }
  path([[0, 28], [0, 17], [-1, 7], [0, -3], [0, -24]], 3.4);
  path([[-28, 6], [-17, 8], [-1, 7], [15, 5], [29, 7], [43, 10]]);
  path([[15, 5], [21, -2], [23, -8]]);
  path([[-17, 8], [-20, -7], [-22, -23]]);
  path([[29, 7], [31, 15], [41, 20]]);

  // A shared palm leaf geometry keeps the complete resort light enough for phones.
  const leafGeo = new T.BufferGeometry();
  leafGeo.setAttribute('position', new T.Float32BufferAttribute([
    0, 0, 0, -.48, -.08, .9, 0, .25, 1.15, .48, -.08, .9,
    -.38, -.36, 1.9, 0, -.05, 2.2, .38, -.36, 1.9, 0, -.75, 3.05
  ], 3)); leafGeo.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 4, 7, 5, 5, 7, 6]);
  leafGeo.computeVertexNormals(); geometries.add(leafGeo);
  function palm(x, z, scale = 1, phase = 0) {
    const g = group('COCONUT_PALM', x, z, phase); g.scale.setScalar(scale);
    contactShadow(g,.25,.2,4.7,3.6,.069/scale);
    const trunk = barBetween('PALM_TRUNK', [0, 0, 0], [.45, 5.7, .2], .2, '#987047', g); trunk.castShadow = true;
    for (let i = 1; i <= 6; i++) {
      const band = cyl('TRUNK_RING', i / 6 * .45, i / 6 * 5.7, i / 6 * .2, .213, .06, '#b68b57', g); band.rotation.z = -.079;
    }
    const crown = new T.Group(); crown.position.set(.45, 5.7, .2); g.add(crown);
    for (let i = 0; i < 7; i++) {
      const leaf = mesh('PALM_FROND', leafGeo, i % 2 ? '#438b58' : '#3b9b65', crown, {side: T.DoubleSide});
      leaf.rotation.y = i / 7 * Math.PI * 2; leaf.rotation.x = i % 3 * .12; leaf.castShadow = true;
    }
    for (let i = 0; i < 3; i++) ball('COCONUT', .45 + Math.cos(i * 2) * .3, 5.6, .2 + Math.sin(i * 2) * .3, .19, '#705039', g);
    palms.push({crown, phase});
  }
  const palmSites = [[-36,0],[-34,13],[-31,-15],[-27,-22],[-18,-27],[-9,-28],[11,-26],[26,-23],[34,-14],[39,-2],[38,8],[33,22],[24,27],[13,30],[-7,30],[-20,27],[-29,22],[-22,16],[-17,19],[-8,18],[7,15],[18,15],[26,2],[19,-12],[-11,-14],[-19,-9],[-28,-4],[10,-15],[-7,1],[7,1],[-4,27],[4,27],[38,15]];
  palmSites.forEach(([x, z], i) => palm(x, z, .72 + (i % 5) * .09, i * 1.73));
  const rockGeometry=new T.IcosahedronGeometry(1,0);geometries.add(rockGeometry);
  for(const [index,a] of [2.55,2.95,3.45,3.9,4.3,4.75,5.15].entries())for(let j=0;j<4;j++){
    const angle=a+(j-1.5)*.033,r=islandShoreRadius(angle)*(1.005+(j%2)*.025),size=.32+(index+j)%4*.18;
    const rock=mesh('WEATHERED_SHORE_ROCK',rockGeometry,['#9da89a','#b8b5a0','#a8b3a3'][j%3]);
    rock.position.set(Math.cos(angle)*45*r,.12+size*.18,Math.sin(angle)*34*r);rock.scale.set(size*1.5,size*.74,size);rock.rotation.set(j*.31,a+j,0);rock.castShadow=true;
  }
  for(let i=0;i<31;i++){
    const a=i*2.399,r=islandShoreRadius(a)*(.885+(i%3)*.025),x=Math.cos(a)*45*r,z=Math.sin(a)*34*r;
    if((x>33&&z>6&&z<24)||(Math.abs(x)<4&&z>23))continue;
    const g=group('DUNE_SEAGRASS',x,z,a);
    for(let j=0;j<5;j++){
      const blade=box('DUNE_GRASS_BLADE',(j-2)*.055,.18+(j%2)*.05,Math.sin(j)*.08,.035,.38+(j%2)*.15,.025,j%2?'#8d9e67':'#b0ad75',g);
      blade.rotation.z=(j-2)*.23;blade.rotation.x=Math.sin(j)*.22;
    }
    if(i%3===0){
      const shell=mesh('PEARL_BEACH_SHELL',sphere,i%2?'#eed9bf':'#f9eada',g);shell.position.set(.6,.035,-.3);shell.scale.set(.16,.045,.12);shell.rotation.y=a;
      for(let j=-1;j<=1;j++){const ridge=box('SHELL_RIDGE',.6+j*.065,.074,-.3,.012,.012,.15,'#d6b69b',g);ridge.rotation.y=j*.35;}
    }
  }

  function roof(parent, w, d, height, color = '#bd8652') {
    const geometry = new T.CylinderGeometry(0, 1, 1, 4, 1); geometries.add(geometry);
    const r = mesh('PALAPA_THATCH_ROOF', geometry, color, parent,{map:thatchGrain}); r.position.y = height; r.rotation.y = Math.PI / 4;
    r.scale.set(w / Math.SQRT2, 2.7, d / Math.SQRT2); r.castShadow = true;
    const trim = box('THATCH_EAVE', 0, height - 1.34, 0, w, .18, d, '#d4ac68', parent); trim.castShadow = true;
    // Slightly irregular frayed eaves finish the roof silhouette without changing
    // any playable floor or adding individual high-resolution straw meshes.
    for(let x=-w/2+.25;x<w/2;x+=.55)for(const z of [-d/2,d/2]){
      const fringe=box('THATCH_EAVE_FRINGE',x,height-1.48,z,.18,.18+(Math.sin(x*7)+1)*.055,.15,'#c89b5c',parent);fringe.rotation.z=Math.sin(x*5)*.12;
    }
  }
  function stools(parent, positions) {
    positions.forEach(([x, z]) => {
      cyl('BAR_STOOL_POST', x, .75, z, .07, 1.4, '#6b735e', parent);
      cyl('BAR_STOOL_SEAT', x, 1.45, z, .43, .16, '#f3c476', parent);
      const hoop = mesh('STOOL_FOOTREST', new T.TorusGeometry(.24, .035, 4, 12), '#c6b688', parent); geometries.add(hoop.geometry); hoop.rotation.x = Math.PI / 2; hoop.position.set(x, .5, z);
    });
  }
  function cocktail(parent, x, z, y, color) {
    const drink = cyl('TROPICAL_DRINK', x, y, z, .11, .24, color, parent);
    const straw = box('PAPER_STRAW', x + .02, y + .2, z, .025, .31, .025, '#fff9db', parent); straw.rotation.z = .3;
    ball('LIME_GARNISH', x + .08, y + .1, z, .08, '#bad766', parent); return drink;
  }
  function bar(name, x, z, angle, accent) {
    const g = group(name, x, z, angle);
    contactShadow(g,0,0,13,10);
    box('BAR_DECK', 0, .12, 0, 10, .25, 7.5, '#ad8255', g);
    for (const xx of [-4.2, 4.2]) for (const zz of [-2.9, 2.9]) box('PALAPA_POST', xx, 2.15, zz, .24, 4.3, .24, '#967345', g);
    roof(g, 11, 8.6, 5.4);
    box('TIKI_COUNTER', 0, .85, -.5, 7.8, 1.7, 1.25, accent, g);
    box('TIKI_COUNTERTOP', 0, 1.75, -.5, 8.2, .16, 1.6, '#f3dfb6', g);
    box('BACKBAR', 0, 1.6, -2.7, 7, .16, .65, '#6c5840', g);
    for (let i = 0; i < 9; i++) cyl('BAR_BOTTLE', -3 + i * .73, 1.98, -2.7, .1, .6, ['#4f8e5e','#dfad51','#e09c86'][i % 3], g);
    stools(g, [-2.9,-.95,.95,2.9].map(xx => [xx, 1.3]));
    [-2.4,0,2.4].forEach((xx, i) => cocktail(g, xx, -.3, 1.95, ['#ffbf63','#f68c80','#d4df83'][i]));
    label(name === 'TIKI_TIDE_BAR' ? 'TIKI TIDE' : 'SUNSET SIPS', 0, 3.4, 2.97, 5.8, g);
    for (const xx of [-3.7, 3.7]) {const lantern = ball('AMBER_LANTERN', xx, 3.4, 2.6, .23, '#ffcf7f', g); lantern.material.emissive.set('#ffb450'); lantern.material.emissiveIntensity = .45;}
    colliders.push({minX: x - 3.9, maxX: x + 3.9, minZ: z - 1.4, maxZ: z + .2});
    return g;
  }
  bar('TIKI_TIDE_BAR', -15, 5.5, 0, '#40a49c');
  bar('SUNSET_SIPS_BAR', 23, -12, 0, '#df8b72');

  // Reception, spa and bungalows give the centre a resort silhouette.
  const resort = group('CORAL_COVE_LODGE', 0, -7);
  contactShadow(resort,0,-.2,21,15);
  box('LODGE_FOUNDATION', 0, .15, 0, 15, .3, 10, '#b6a182', resort);
  box('LODGE_WALLS', 0, 1.9, -1.5, 13, 3.6, 6, '#f5e3b9', resort).castShadow = true;
  for (const x of [-4.5,-1.5,1.5,4.5]) {
    box('LODGE_WINDOW', x, 2, 1.55, 1.6, 1.7, .08, '#6bb5ba', resort, {roughness: .25});
    box('WOOD_WINDOW_LINTEL', x, 2.95, 1.66, 1.9, .15, .15, '#a87d51', resort);
  }
  box('LODGE_DOOR', 0, 1.3, 1.65, 1.4, 2.6, .12, '#ad7b4a', resort);
  for (const x of [-6.6, 6.6]) box('LODGE_VERANDA_POST', x, 1.8, 3.8, .25, 3.6, .25, '#9a7652', resort);
  roof(resort, 16, 11.5, 5.1, '#c99166'); label('CORAL COVE', 0, 3.4, 4.6, 8, resort);
  colliders.push({minX: -6.5, maxX: 6.5, minZ: -11.5, maxZ: -5.5});
  for (let i = 0; i < 3; i++) {
    const g = group('GARDEN_BUNGALOW_' + i, -11 + i * 11, -18.3, 0);
    contactShadow(g,0,0,8,7);
    box('BUNGALOW', 0, 1.25, 0, 5.2, 2.5, 4.2, '#eadfb6', g); roof(g, 6.2, 5.5, 3.6, '#a9794e');
    box('BUNGALOW_DOOR', 0, 1, 2.16, 1.1, 2, .08, '#5d9f9d', g);
    for (const xx of [-1.7,1.7]) box('BUNGALOW_WINDOW', xx, 1.5, 2.16, .85, .9, .08, '#9cdbd5', g);
    colliders.push({minX: -13.6 + i * 11, maxX: -8.4 + i * 11, minZ: -20.4, maxZ: -16.2});
  }
  function lounger(parent, x, z, angle = 0, color = '#f4e6c7') {
    const g = group('SUN_LOUNGER', x, z, angle, parent); g.position.y = 0;
    box('LOUNGER_FRAME', 0, .34, 0, .85, .12, 2.1, '#b99b69', g);
    box('LOUNGER_CUSHION', 0, .46, .3, .79, .12, 1.45, color, g);
    const back = box('LOUNGER_BACK', 0, .8, -.7, .79, .12, .9, color, g); back.rotation.x = -.65;
    for (const xx of [-.34,.34]) for (const zz of [-.7,.7]) box('LOUNGER_FOOT', xx, .16, zz, .09, .32, .09, '#b99b69', g);
  }
  const cabanas = group('CABANA_COVE', -28, 7);
  for (let i = 0; i < 3; i++) {
    const g = group('BEACH_CABANA_' + i, -1, -7 + i * 7, Math.PI / 2, cabanas); g.position.y = 0;
    contactShadow(g,0,0,7.8,7.4);
    box('CABANA_PLATFORM', 0, .14, 0, 4.8, .28, 4.8, '#bb966b', g);
    for (const x of [-2,2]) for (const z of [-2,2]) box('CABANA_POST', x, 1.7, z, .15, 3.4, .15, '#f5e2ba', g);
    roof(g, 5.5, 5.5, 4.1);
    for (const x of [-1.85,1.85]) {const curtain = box('CABANA_CURTAIN', x, 1.8, -.4, .09, 2.7, 3.4, '#f5f1dc', g, {transparent:true,opacity:.7,side:T.DoubleSide}); curtain.rotation.y = .05;}
    lounger(g, -.7, 0); lounger(g, .7, 0, 0, '#abd9d2');
  }
  label('CABANA COVE', -28, 4.7, 9, 8);
  function umbrella(x, z, color) {
    const g = group('BEACH_UMBRELLA', x, z);
    cyl('UMBRELLA_POLE', 0, 1.3, 0, .055, 2.6, '#d1ae74', g);
    const canopyGeo = new T.ConeGeometry(1.8, .8, 8, 1, true); geometries.add(canopyGeo);
    mesh('STRIPED_PARASOL', canopyGeo, color, g, {side:T.DoubleSide}).position.y = 2.8;
    lounger(g, -1, 1.4, .1); lounger(g, 1, 1.4, -.1, '#ddaa8e');
  }
  [[-19,24],[-12,27],[14,27],[22,24],[29,19]].forEach(([x,z],i)=>umbrella(x,z,['#e8957e','#5ebcb5','#e6ba68'][i%3]));

  // Beach games: tactile coloured balls, a full sand court and a hammock garden.
  const court = group('BEACH_VOLLEYBALL', 12, 17);
  box('VOLLEYBALL_SAND', 0, .055, 0, 13.2, .06, 8.2, '#e8d098', court);
  for (const z of [-3.7,3.7]) box('COURT_LINE', 0, .095, z, 12, .018, .06, '#f9f6d7', court);
  for (const x of [-6,6]) box('COURT_LINE', x, .095, 0, .06, .018, 7.4, '#f9f6d7', court);
  for (const z of [-4.1,4.1]) cyl('VOLLEYBALL_POST', 0, 1.8, z, .09, 3.6, '#df886e', court);
  for (let i = 0; i < 5; i++) box('VOLLEYBALL_NET_HORIZONTAL', 0, 2.15 + i * .22, 0, .025, .02, 8.2, '#fff7df', court);
  for (let i = 0; i < 25; i++) box('VOLLEYBALL_NET_VERTICAL', 0, 2.59, -4.1 + i * 8.2 / 24, .025, .9, .018, '#fff7df', court);
  box('NET_TOP_TAPE', 0, 3.08, 0, .07, .09, 8.3, '#f7ead2', court);
  function beachBall(x,z,r=.5) {
    const g = group('BEACH_BALL', x,z); g.position.y=.36+r;
    const colors=['#f8ecbd','#ed9578','#f5ce6d','#64beb6','#f8ecbd','#719fae'];
    for(let i=0;i<6;i++){
      const geo=new T.SphereGeometry(r,8,8,i*Math.PI/3,Math.PI/3);geometries.add(geo);
      mesh('BEACH_BALL_PANEL',geo,colors[i],g);
    }
    return {root:g,home:{x,z},radius:r};
  }
  const balls = [beachBall(9,21),beachBall(16,14,.37),beachBall(-21,19,.4)];
  label('BEACH PLAY',12,4,22,7);
  for (let i = 0; i < 2; i++) {
    const g = group('HAMMOCK_GARDEN', -12 + i * 10, 14, -.12);
    for (const x of [-2.4,2.4]) barBetween('HAMMOCK_POST',[x,0,0],[x*.9,2.4,0],.1,'#92734d',g);
    const points = [new T.Vector3(-2.15,2,0),new T.Vector3(-1,1.2,0),new T.Vector3(1,1.2,0),new T.Vector3(2.15,2,0)];
    const curve = new T.CatmullRomCurve3(points), geo = new T.TubeGeometry(curve,16,.32,4,false);geometries.add(geo);
    const hammock=mesh('WOVEN_HAMMOCK',geo,i?'#e6bc75':'#75b9ac',g);hammock.scale.z=1.5;
  }

  function dock(x,z,length=12,width=3) {
    const g = group('LAGOON_DOCK', x,z);g.position.y=.1;
    box('DOCK_PLANKS', length/2, .5,0,length,.3,width,'#a58259',g);
    for(let xx=.4;xx<length;xx+=.65){
      box('DOCK_PLANK_SEAM',xx,.657,0,.025,.015,width,'#87684a',g);
      for(const zz of [-width*.35,width*.35])cyl('WEATHERED_PLANK_NAIL',xx+.1,.669,zz,.025,.012,'#66736a',g);
    }
    for(let xx=0;xx<=length;xx+=length/3)for(const zz of [-width/2,width/2]){
      cyl('DOCK_PILING',xx,.15,zz,.14,2.4,'#8f7859',g);cyl('DOCK_PILING_CAP',xx,1.4,zz,.19,.16,'#ead8a7',g);
    }
    const ropeGeometry=new T.TorusGeometry(.2,.022,4,20);geometries.add(ropeGeometry);
    for(const xx of [length/3,length*2/3])for(const zz of [-width/2,width/2]){
      const wrap=mesh('MOORING_ROPE',ropeGeometry,'#d8c796',g);wrap.position.set(xx,1.21,zz);wrap.rotation.x=Math.PI/2;
    }
    for(const zz of [-width*.26,width*.26])box('DOCK_CLEAT',length-.55,.77,zz,.35,.12,.09,'#78908a',g);
    const ladderX=length-1.1;
    for(const xx of [ladderX-.35,ladderX+.35])barBetween('SWIM_LADDER_RAIL',[xx,-.3,width/2+.25],[xx,1.05,width/2+.25],.045,'#adbdaf',g);
    for(let y=-.15;y<.8;y+=.3)barBetween('SWIM_LADDER_RUNG',[ladderX-.35,y,width/2+.25],[ladderX+.35,y,width/2+.25],.035,'#adbdaf',g);
    return g;
  }
  dock(35,10,11,3.1);dock(36,20,10,3.1);
  label('PADDLE PIER',40,4.4,9,8);label('PONTOON CLUB',39,4.4,20,8);
  function paddleBoat(id,x,z,color,heading=0) {
    const g=group(id.toUpperCase(),x,z,heading);g.position.y=.15;
    for(const xx of [-.67,.67]){
      const hull=ball('PADDLE_BOAT_HULL',xx,.15,0,1,color,g);hull.scale.set(.4,.38,1.7);
      box('PADDLE_SEAT',xx,.6,.1,.65,.15,.75,'#fff1c8',g);
      box('SEAT_BACK',xx,.85,-.26,.65,.5,.12,'#fff1c8',g);
    }
    box('PADDLE_BOAT_BOW',0,.27,-1.05,1.7,.23,.6,color,g);
    box('PADDLE_BOAT_FLOOR',0,.31,.1,1.7,.14,1.8,color,g);
    const pedal=cyl('PADDLE_WHEEL',0,.13,1.25,.42,1.8,'#f0cf76',g);pedal.rotation.z=Math.PI/2;
    for(let i=0;i<6;i++){const blade=box('PADDLE_WHEEL_BLADE',0,.13,1.25,1.5,.08,.8,'#f4d588',g);blade.rotation.x=i*Math.PI/3;}
    return {id,root:g,home:{x,z,heading},kind:'paddle',pedal};
  }
  const boats=[paddleBoat('paddle-boat',47.5,10,'#eea171',Math.PI/2),paddleBoat('paddle-boat-blue',49,5.8,'#68b8c2',Math.PI/2)];
  const pontoon=group('PONTOON',49,20,Math.PI/2);pontoon.position.y=.12;
  for(const xx of [-1.3,1.3]){const hull=cyl('PONTOON_FLOAT',xx,0,0,.42,6.3,'#d6d9bd',pontoon);hull.rotation.x=Math.PI/2;}
  box('PONTOON_DECK',0,.52,0,3.4,.25,6,'#c1a378',pontoon);
  for(const xx of [-1.5,1.5])for(const zz of [-2.7,2.7]){
    box('PONTOON_CANOPY_POST',xx,1.8,zz,.075,2.6,.075,'#d5d8c6',pontoon);
    box('PONTOON_RAIL_POST',xx,.98,zz,.07,.9,.07,'#d5d8c6',pontoon);
  }
  box('PONTOON_CANOPY',0,3.15,0,3.7,.17,6.5,'#efbb76',pontoon);
  for(const xx of [-1.5,1.5])box('PONTOON_SIDE_RAIL',xx,1.3,0,.07,.07,5.6,'#d5d8c6',pontoon);
  for(const zz of [-1.6,.4]){box('PONTOON_BENCH',0,1,zz,2.6,.25,.8,'#f3e5bc',pontoon);box('PONTOON_BENCH_BACK',0,1.4,zz-.35,2.6,.7,.18,'#54a8a2',pontoon);}
  box('PONTOON_HELM',.9,1.25,-2.2,.7,.8,.6,'#67ada6',pontoon);
  const wheelGeo=new T.TorusGeometry(.24,.035,6,20);geometries.add(wheelGeo);const wheel=mesh('CAPTAINS_WHEEL',wheelGeo,'#ece1b6',pontoon);wheel.position.set(.9,1.8,-1.95);wheel.rotation.x=-.6;
  boats.push({id:'pontoon',root:pontoon,home:{x:49,z:20,heading:Math.PI/2},kind:'pontoon'});

  // The shallow reef has its own organic seabed and a transparent water film.
  // Coral and fish sit above the distant opaque sea, so the actual snorkel
  // camera sees the garden through water rather than seeing a flat turquoise lid.
  const reefFloor=terrain('REEF_SAND_SHELF',7.7,6.2,-.065,'#8ad7c0',1,{map:sandGrain});reefFloor.position.set(-30,0,-28);
  const reefWater=terrain('CLEAR_SNORKEL_WATER',7.7,6.2,.305,'#8be5d3',1,{transparent:true,opacity:.18,depthWrite:false,roughness:.16,metalness:.05});reefWater.position.set(-30,0,-28);
  const reef=group('SNORKEL_REEF',-30,-28);reef.position.y=.035;
  for(let i=0;i<18;i++){
    const a=i*2.39,r=2+(i%5)*.8,x=Math.cos(a)*r,z=Math.sin(a)*r;
    const coral=ball('LAGOON_CORAL',x,.02,z,.4+(i%3)*.12,['#d4878b','#e9b08a','#8ac3a7','#a5b1ce'][i%4],reef);coral.scale.y=.6;
    if(i%3===0)for(let j=0;j<3;j++){
      const branch=cyl('STAGHORN_CORAL_BRANCH',x+(j-1)*.16,.19+(j%2)*.08,z,.045,.4+(j%2)*.18,'#dcb2aa',reef);branch.rotation.z=(j-1)*.37;
    }
  }
  for(let i=0;i<9;i++){
    const g=new T.Group();g.name='REEF_FISH';reef.add(g);
    const body=ball('FISH_BODY',0,0,0,.18,['#f6cb72','#75b7bc','#efa38d'][i%3],g);body.scale.set(1.7,.7,.55);
    const tail=box('FISH_TAIL',-.29,0,0,.21,.28,.035,'#f3d59b',g);tail.rotation.z=Math.PI/4;
    fish.push({root:g,phase:i*2.1});
  }
  const buoyGeo=new T.TorusGeometry(.45,.11,6,18);geometries.add(buoyGeo);
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2,x=-30+Math.cos(a)*7.5,z=-28+Math.sin(a)*6;
    const buoy=mesh('SNORKEL_AREA_BUOY',buoyGeo,i%2?'#fff0c9':'#ec9a76');buoy.position.set(x,.05,z);buoy.rotation.x=Math.PI/2;floats.push({root:buoy,phase:i});
  }
  const snorkelStand=group('SNORKEL_STAND',-22,-23);
  box('SNORKEL_RACK',0,1.2,0,3,.12,.7,'#ad8b58',snorkelStand);
  for(const xx of [-1.3,1.3])box('SNORKEL_RACK_LEG',xx,.6,0,.12,1.2,.55,'#ad8b58',snorkelStand);
  for(const xx of [-.9,0,.9]){const mask=mesh('SNORKEL_MASK',new T.TorusGeometry(.22,.06,6,12),'#65b4b3',snorkelStand);geometries.add(mask.geometry);mask.position.set(xx,1.55,0);}
  label('REEF EXPLORER',-22,4,-24,8);

  const lookout=group('SUNSET_LOOKOUT',1,-27);
  box('LOOKOUT_DECK',0,.2,0,9,.4,4,'#b89b71',lookout);
  for(const xx of [-4.2,4.2])for(const zz of [-1.6,1.6])box('LOOKOUT_POST',xx,.7,zz,.12,1.4,.12,'#9e8058',lookout);
  box('LOOKOUT_RAIL',0,1.3,-1.6,8.5,.08,.08,'#9e8058',lookout);
  cyl('TELESCOPE_STAND',0,.9,-.7,.07,1.4,'#68868a',lookout);
  const scope=cyl('LOOKOUT_TELESCOPE',0,1.65,-.7,.16,.9,'#e4d3a8',lookout);scope.rotation.x=.9;
  label('HORIZON POINT',1,4.2,-27,8);

  // Small living details stay deterministic and need no downloaded assets.
  for(let i=0;i<20;i++){
    const a=i*2.399,x=Math.cos(a)*(12+(i%4)*3.5),z=Math.sin(a)*(8+(i%5)*2.5);
    if(Math.abs(x)<7&&z<-3)continue;
    const g=group('TROPICAL_FLOWERS',x,z);
    for(let j=0;j<3;j++){const stem=box('FLOWER_STEM',j*.2,.3,0,.025,.6,.025,'#4c8f5e',g);ball('HIBISCUS',stem.position.x,.65,0,.14,j%2?'#e89483':'#ecc568',g);}
  }
  const entrance=group('WELCOME_ARCH',0,26.5);
  for(const xx of [-2.1,2.1])box('WELCOME_POST',xx,1.9,0,.19,3.8,.19,'#b38b58',entrance);
  box('WELCOME_SIGN',0,3.4,0,5.4,.9,.23,'#368f8d',entrance);label('ISLAND ADVENTURE',0,3.4,.15,5.2,entrance);
  function guest(name,x,z,color,angle=0,staff=false){
    const g=group(name,x,z,angle);
    box('GUEST_SHIRT',0,1.16,0,.48,.58,.3,color,g);
    box('GUEST_SHORTS',0,.76,0,.43,.24,.3,'#485d64',g);
    for(const side of [-1,1]){
      box('GUEST_LEG',side*.13,.4,0,.14,.51,.15,'#c8916c',g);
      box('GUEST_SANDAL',side*.13,.12,.06,.18,.07,.28,'#85674e',g);
      const arm=box('GUEST_ARM',side*.34,1.1,0,.13,.5,.14,'#c8916c',g);arm.rotation.z=side*.14;
    }
    ball('GUEST_HEAD',0,1.67,0,.24,'#ce9c75',g);
    if(staff){cyl('RESORT_STAFF_HAT',0,1.9,0,.3,.08,'#f8e6ba',g);cyl('RESORT_STAFF_HAT_CROWN',0,1.97,0,.2,.15,'#f8e6ba',g);}
    else {box('SUNGLASSES',0,1.7,.216,.35,.095,.045,'#3c5c62',g);ball('GUEST_HAIR',0,1.84,-.03,.2,'#665341',g).scale.y=.5;}
    guests.push({root:g,phase:x+z});return g;
  }
  guest('TIKI_BARTENDER',-15,3.5,'#5bc2b5',Math.PI,true);
  guest('SUNSET_BARTENDER',23,-14,'#e8a17b',Math.PI,true);
  guest('ISLAND_CONCIERGE',3,22,'#55aba4',-.7,true);
  guest('PADDLE_CREW',41,12.5,'#eaa169',.5,true);
  guest('CABANA_ATTENDANT',-24,12,'#f0d278',.2,true);
  [[-18,11,'#eab07d',.2],[-12,11,'#72b0bc',-.7],[21,-6,'#d99db1',1.2],[25,-6,'#8bafc6',-1],[-19,24,'#d09876',.4],[25,26,'#ccad78',2.2],[17,19,'#ea9f83',-1.7],[8,15,'#78b7a7',.8],[-19,-24,'#d4a3ba',2],[3,-24,'#83b9bd',2.8]].forEach(([x,z,c,a])=>guest('RESORT_GUEST',x,z,c,a));
  for(let i=0;i<8;i++){
    const g=new T.Group();g.name='SEABIRD';root.add(g);
    for(const sign of [-1,1]){const wing=box('GULL_WING',sign*.3,0,0,.62,.045,.14,'#fff7dc',g);wing.rotation.z=sign*.2;}
    birds.push({root:g,phase:i*1.7});
  }
  for(let i=0;i<7;i++){
    const g=group('TRADEWIND_CLOUD',-90+i*29,-80+(i%3)*30);g.position.y=25+(i%3)*3;
    for(let j=0;j<3;j++){const cloud=ball('CLOUD_PUFF',j*3,0,0,3.3,'#f7f6de',g);cloud.scale.set(1.7,.45,.8);}
    clouds.push(g);
  }

  const interactionPoints = [
    {id:'tiki-bar',type:'bar',x:-15,z:9,radius:4.3,label:'Tiki Tide Bar'},
    {id:'sunset-bar',type:'bar',x:23,z:-8,radius:4.3,label:'Sunset Sips'},
    {id:'cabanas',type:'relax',x:-25,z:7,radius:4.5,label:'Cabana Cove'},
    {id:'beach-ball',type:'ball',x:9,z:21,radius:4,label:'Beach Ball Rally'},
    {id:'paddle-boat',type:'boat',x:43,z:10,radius:4.5,label:'Paddle Pier'},
    {id:'pontoon',type:'boat',x:43,z:20,radius:4.5,label:'Pontoon Club'},
    {id:'snorkel',type:'snorkel',x:-22,z:-23,radius:4,label:'Reef Explorer'},
    {id:'lookout',type:'lookout',x:1,z:-25,radius:4,label:'Horizon Point'}
  ];
  const docks=[{minX:34.5,maxX:46.5,minZ:8.3,maxZ:11.7,height:.77},{minX:35.5,maxX:46.5,minZ:18.3,maxZ:21.7,height:.77}];
  function onDock(x,z){return docks.find(d=>x>=d.minX&&x<=d.maxX&&z>=d.minZ&&z<=d.maxZ);}
  // Reuse static geometry as GPU instances. Animation/vehicle roots remain intact
  // so the game can move boats and kick balls without touching map decoration.
  function batchGeometry(target, exclusions = new Set()) {
    target.updateWorldMatrix(true,true);
    const inverse=target.matrixWorld.clone().invert(), buckets=new Map();
    target.traverse(node=>{
      if(!node.isMesh||node.isInstancedMesh)return;
      let parent=node;while(parent&&parent!==target){if(exclusions.has(parent))return;parent=parent.parent;}
      const key=node.geometry.uuid+':'+node.material.uuid+':'+node.castShadow;
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(node);
    });
    for(const meshes of buckets.values()){
      if(meshes.length<2)continue;
      const first=meshes[0],batch=new T.InstancedMesh(first.geometry,first.material,meshes.length);
      batch.name='ISLAND_INSTANCES_'+first.name;batch.castShadow=first.castShadow;batch.receiveShadow=true;batch.renderOrder=first.renderOrder;
      meshes.forEach((m,i)=>{batch.setMatrixAt(i,inverse.clone().multiply(m.matrixWorld));m.removeFromParent();});
      batch.instanceMatrix.needsUpdate=true;target.add(batch);
    }
  }
  const dynamicRoots=new Set([...palms.map(p=>p.crown),...boats.map(b=>b.root),...balls.map(b=>b.root),...floats.map(f=>f.root),...birds.map(b=>b.root),...guests.map(g=>g.root),...fish.map(f=>f.root)]);
  for(const target of dynamicRoots)if(!target.isMesh)batchGeometry(target);
  batchGeometry(root,dynamicRoots);
  const world={root,water,boats,balls,interactionPoints,colliders,docks,palms,foam,floats,birds,clouds,flags,guests,fish,
    bounds:{minX:-63,maxX:63,minZ:-53,maxZ:53},spawn:{x:0,z:24},
    isLand:(x,z)=>isIslandLand(x,z)||!!onDock(x,z),groundHeight:(x,z)=>onDock(x,z)?.height??.36,
    shoreRadius:islandShoreRadius,
    dispose(){for(const g of geometries)g.dispose();for(const texture of textures)texture.dispose();for(const m of materials.values())m.dispose();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.isSprite){o.material.map?.dispose();o.material.dispose();}});}
  };
  return world;
}

export function animateTropicalIslandWorld(world,time,dt=0) {
  for(const {crown,phase} of world.palms)crown.rotation.z=Math.sin(time*.75+phase)*.025;
  for(const boat of world.boats){boat.root.position.y=.14+Math.sin(time*1.5+boat.home.x)*.065;boat.root.rotation.z=Math.sin(time*1.1+boat.home.z)*.012;}
  for(const {root,phase} of world.floats)root.position.y=.04+Math.sin(time*1.8+phase)*.07;
  for(let i=0;i<world.birds.length;i++){
    const {root,phase}=world.birds[i],a=time*.07+phase;
    root.position.set(Math.cos(a)*42,13+Math.sin(a*2)*2,Math.sin(a)*32);
    root.rotation.y=-a-Math.PI/2;root.rotation.z=Math.sin(time*3+phase)*.09;
  }
  for(let i=0;i<world.foam.length;i++)world.foam[i].material.opacity=.5+Math.sin(time*.8+i*2)*.18;
  for(const {root,phase} of world.guests)root.rotation.z=Math.sin(time*.8+phase)*.014;
  for(const {root,phase} of world.fish){const a=time*.3+phase;root.position.set(Math.cos(a)*4.2,.14+Math.sin(a*2)*.055,Math.sin(a)*2.7);root.rotation.y=-a;}
}
