import {applyBuilderBaseTransform} from './builder-base.js';
import {addFiringRangeDressing} from './layout-firing-range.js';
import {finishLayoutArchitecture} from './layout-details.js';
import {layoutHeight,createLayoutTerrain,createLayoutMaterial} from './layout-terrain.js';
import {isBasketballEnvironment} from '../basketball-rules.js';
import {createServerStreets} from './server-streets.js';
import {createBasketballStadium} from '../basketball-stadium.js';
import * as THREE from '../../vendor/three/three.module.min.js';
export function createBuilderLand(environment) {
    const built = environment.builderScene || {};
    const layout = built.layout || environment.layout || 'grand-floor';
    if (isBasketballEnvironment(environment)) return createBasketballStadium(THREE, environment);
    const meta = built.layoutMeta || environment.layoutMeta || {};
    const heightAt=(x,z)=>layoutHeight(layout,x,z);
    const geometry=createLayoutTerrain(layout,built.mapSize,Number(meta.color)||0x315b32);
    const terrain=new THREE.Mesh(geometry,createLayoutMaterial(layout,built.mapSize));
    terrain.name = `BUILDER_WALKABLE_FLOOR_${layout}`; terrain.rotation.x = -Math.PI / 2; terrain.receiveShadow = true; terrain.userData.colliderShape = 'mesh';
    const root = new THREE.Group(); root.name = `PROCEDURAL_${environment.id}`; root.add(terrain); root.userData.proceduralLand = true; root.userData.layout = layout;root.userData.streetHeightAt=heightAt;
    // Recreate the complete template, not merely its terrain plane. Every mesh
    // is part of the world root, so the standard collision pass automatically
    // makes buildings, trees, rails, cover and set dressing solid in Test Map.
    const mazeSegments=[[-18,-18,36,0],[-18,18,36,0],[-18,0,36,1],[18,0,36,1],[-12,-12,12,0],[6,-12,18,0],[-6,-6,18,0],[12,-3,12,1],[-12,0,12,1],[0,0,12,0],[6,6,24,0],[-6,9,12,1],[-12,14,12,0],[12,14,12,0],[0,15,6,1]];
    const add = (size, x, z, color, y = size[1] / 2, rotation = 0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness:.82, metalness:.08 })); mesh.name = `BUILDER_TEMPLATE_${layout}`; mesh.position.set(x, heightAt(x, z) + y, z); mesh.rotation.y = rotation; mesh.castShadow = mesh.receiveShadow = true; mesh.userData.feetLockedToFloor = true; root.add(mesh); return mesh; };
    if(['hedge-maze','neon-maze','dungeon-maze'].includes(layout)){const color=layout==='hedge-maze'?0x285f32:layout==='neon-maze'?0x316b88:0x625e55,height=layout==='dungeon-maze'?3.2:2.6;mazeSegments.forEach(([x,z,length,vertical])=>add(vertical?[1,height,length]:[length,height,1],x,z,color));}
    else if(layout==='vendor-street')[-12,-6,0,6,12].forEach((z,i)=>{add([5,3.2,4],-15,z,i%2?0x9e5845:0x477786);add([5,3.2,4],15,z,i%2?0x7650a1:0xa97a3b)});
    else if(layout==='creator-studios')[-12,-4,4,12].forEach((x,i)=>add([6,3.8,7],x,8,i%2?0x476779:0x6c4e79));
    else if(layout==='market-square')for(let i=0;i<10;i++){const a=i/10*Math.PI*2;add([3,2.1,2.2],Math.cos(a)*13,Math.sin(a)*13,i%2?0xc0783e:0x4c8c69,.95,-a)}
    else if(layout==='mountain-pass')[-16,-12,12,16].forEach((x,i)=>add([3,5+i%2*2,9],x,i%2?8:-8,0x485044,2));
    else if(layout==='crystal-cavern')for(let i=0;i<18;i++){const a=i/18*Math.PI*2,r=8+(i%4)*2,crystal=add([.6,2+(i%3),.6],Math.cos(a)*r,Math.sin(a)*r,i%2?0x54d9ff:0x9a62ff,1);crystal.rotation.z=(i%3-1)*.18}
    else if(layout==='railroad-world'){[-1.15,1.15].forEach(x=>add([.14,.16,38],x,0,0xa8a093));for(let z=-18;z<=18;z+=1.4)add([4,.12,.22],0,z,0x60402a);add([8,.6,16],-9,2,0x6b655b)}
    else if(layout==='skyport'||layout==='desert-airfield'){add([5,.08,38],0,0,0x26333a);for(let z=-16;z<=16;z+=4)add([.18,.04,1.8],0,z,0xe8f5dc);add([12,4,6],-12,7,0x536b72);add([8,2.5,5],12,8,0x3b555f)}
    else if(layout==='dune-sea'){for(let i=-15;i<=15;i+=6)add([4,.18,12],i,0,i%12?0xc69b58:0xd3ad6b,.09,.18)}
    else if(layout==='deep-mine'){add([8,2.8,5],10,10,0x6c4a31);[-10,0,10].forEach(z=>add([1.5,1.4,2.2],-10,z,0xb67835))}
    else if(layout==='sunrise-farm'){[-12,-7,-2,3,8,13].forEach((x,i)=>add([2.5,.12,32],x,0,i%2?0x8f9e3f:0xc29b42));add([7,4.5,6],12,10,0x9c433a);add([4,6,4],-12,11,0xb4a36b)}
    else if(layout==='coastal-cliffs'){add([12,.12,38],14,0,0x237fa0);[-15,-8,0,9].forEach((z,i)=>add([4,1.2+i%2,3],3,z,0x677866))}
    else if(layout==='ancient-forest')for(let i=0;i<22;i++){const a=i*2.4,r=7+(i%5)*2;add([.55,3.8,.55],Math.cos(a)*r,Math.sin(a)*r,0x68452c,1.9);add([2.5,2.2,2.5],Math.cos(a)*r,Math.sin(a)*r,0x28643a,4.2)}
    else if(layout==='neon-wetlands')for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=7+(i%3)*3;add([2.2,.12,2.2],Math.cos(a)*r,Math.sin(a)*r,i%2?0x62d986:0x42bfc7,.08);add([.12,1.2,.12],Math.cos(a)*r+.7,Math.sin(a)*r,0xb9ff38,.6)}
    else if(layout==='blacksite'){[-14,0,14].forEach(x=>add([5,3.5,7],x,x?9:-2,0x343d39));[-10,10].forEach(z=>add([10,1.5,2],0,z,0x58645d))}
    else if(layout==='cargo-yard')for(let i=0;i<12;i++)add([5,2.5,2.4],-12+(i%3)*12,-13+Math.floor(i/3)*8,i%2?0xb75a36:0x356b81,1.25,i%3?0:Math.PI/2);
    else if(layout==='neon-arena'){[-12,12].forEach(x=>{add([5,2.4,8],x,0,0x263b5c);add([.3,.2,28],x/2,0,x<0?0xff3ba7:0x39e8ff,.1)});add([7,.8,7],0,0,0x7146a6,.4)}
    else if(layout==='desert-outpost'){[[-12,-10],[11,-9],[-10,10],[12,9]].forEach(([x,z],i)=>add([6,2.8,5],x,z,i%2?0x8d7654:0x71624c));add([3,5,3],0,0,0x5a5549)}
    else if(layout==='mega-mall'){[-13,-6,6,13].forEach((x,i)=>add([5,3.2,8],x,10,i%2?0x54707a:0x79566d));add([9,.5,9],0,0,0x8ba8a1,.25)}
    else if(layout==='office-tower'){add([7,5,7],0,0,0x566a73);[-13,13].forEach(x=>add([5,3,10],x,4,0x40525a));add([18,.15,2],0,-10,0x83a0a7)}
    else if(layout==='firing-range')addFiringRangeDressing(root,add,heightAt);
    else if(layout==='movie-studio'){[[-11,-10],[10,-10],[-11,10],[10,10]].forEach(([x,z],i)=>add([8,4,7],x,z,i%2?0x52475a:0x45535b));add([3,.3,16],0,0,0xb65b48,.15)}
    finishLayoutArchitecture(root);
    root.add(createServerStreets(environment.streets||built.streets||[],{heightAt}));
    applyBuilderBaseTransform(root,built.baseTransform);
    return root;
  }
