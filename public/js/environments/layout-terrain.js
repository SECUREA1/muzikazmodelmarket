import * as THREE from '../../vendor/three/three.module.min.js';
export function layoutHeight(layout, x, z) {
      if(layout.startsWith('urban-'))return 0;
      const ripple = .28 * Math.sin(x * .31) * Math.cos(z * .27);
      if (['community-park','grand-floor','hedge-maze','neon-maze','dungeon-maze','vendor-street','creator-studios','market-square','railroad-world','skyport','desert-airfield','blacksite','cargo-yard','neon-arena','desert-outpost','mega-mall','office-tower','firing-range','movie-studio'].includes(layout)) return ['community-park','grand-floor'].includes(layout) ? 0 : ripple * .18;
      if (layout === 'loft') return ripple;
      if (layout === 'suite') return .16 * Math.sin(x * .45) + .1 * Math.cos(z * .35);
      if (layout === 'mountain-pass') return 1.2 + Math.sin(x * .18) * 1.5 + Math.cos(z * .22) * 1.1 - 2.2 * Math.exp(-(x * x) / 18);
      if (layout === 'crystal-cavern') return -.6 + Math.abs(Math.sin(x * .25) * Math.cos(z * .2)) * 1.25;
      if (layout === 'deep-mine') return -Math.min(3.2, Math.max(0, Math.floor((20 - Math.max(Math.abs(x), Math.abs(z))) / 4)) * .55) + ripple * .3;
      if (layout === 'sunrise-farm') return .35 * Math.sin(x * .18) + .22 * Math.cos(z * .2);
      if (layout === 'coastal-cliffs') return x > 5 ? -1.5 : 1.1 + Math.sin(z * .16) * .65 - Math.max(0, x + 7) * .055;
      if (layout === 'ancient-forest') return .45 * Math.sin(x * .2) + .4 * Math.cos(z * .17) + 1.25 * Math.exp(-(x * x + z * z) / 120);
      if (layout === 'neon-wetlands') return -.35 + Math.max(0, .7 * Math.sin(x * .22) * Math.cos(z * .25));
      if (layout === 'dune-sea') return .75 * Math.sin(x * .16) + .55 * Math.cos(z * .19) + .25 * Math.sin((x + z) * .3);
      return ripple + 1.1 * Math.exp(-(x * x + z * z) / 85);
}

export function layoutSize(value) { return Math.max(40,Math.min(512,Number(value)||40)); }
// World-space sampling is identical in the editor, browser and server.
export function createLayoutTerrain(layout, size, color=0x315b32) {
 size=layoutSize(size);const segments=Math.min(160,Math.max(80,Math.round(size)));
 const geometry=new THREE.PlaneGeometry(size,size,segments,segments),positions=geometry.attributes.position,colors=[];
 const base=new THREE.Color(color),tint=new THREE.Color();
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),z=-positions.getY(i),height=layoutHeight(layout,x,z);
  positions.setZ(i,height);
  const grain=Math.sin(x*1.7+Math.cos(z*.8))*.018+Math.cos(z*1.3-x*.6)*.014;
  const broad=Math.sin(x*.09)*Math.cos(z*.11)*.065;
  tint.copy(base).multiplyScalar(1+broad+grain);
  if(layout==='community-park'){
   const plaza=Math.hypot(x,z-8)<8.5;
   const promenade=Math.abs(x-8)<1.7&&z>=8&&z<=61;
   const serviceWalk=Math.abs(z-61)<1.7&&Math.abs(x)<=27;
   const loungeWalk=Math.abs(z-19)<1.5&&x>=-22&&x<=24;
   if(plaza||promenade||serviceWalk||loungeWalk)tint.setHex(0x88958d).multiplyScalar(1+grain);
   if(plaza&&Math.hypot(x,z-8)>7.5)tint.setHex(0xb6a875).multiplyScalar(1+grain);
  }
  colors.push(tint.r,tint.g,tint.b);
 }
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}

export function createLayoutMaterial(layout,size) {
 // Repeatable local surface detail needs no image requests or browser canvas.
 const resolution=64,data=new Uint8Array(resolution*resolution*4);
 const stone=/urban|dungeon|mine|blacksite|cargo|range|railroad|market|mall|office|grand-floor/.test(layout);
 const sand=/desert|dune|airfield/.test(layout);
 const wood=/loft|suite|studio/.test(layout);
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
  const noise=((x*73+y*151+x*y*13)%97)/97;
  let value=224+noise*25;
  if(stone&&(x%16===0||y%16===0))value=182;
  else if(wood)value=219+Math.sin(x*.7+Math.sin(y*.09)) *12+noise*18;
  else if(sand)value=232+Math.sin((x+y)*.45)*6+noise*12;
  const i=(y*resolution+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
 }
 const map=new THREE.DataTexture(data,resolution,resolution);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(layoutSize(size)/8,layoutSize(size)/8);map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
 return new THREE.MeshStandardMaterial({color:0xffffff,map,vertexColors:true,roughness:.94,metalness:0});
}
