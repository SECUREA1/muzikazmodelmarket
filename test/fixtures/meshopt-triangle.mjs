// Original triangle geometry, encoded with meshoptimizer 1.3.0's
// encodeGltfBuffer(vertices,3,12,'ATTRIBUTES',0). Version 0 deliberately matches
// the bundled browser decoder; the fixture needs no encoder at test/runtime.
export function meshoptTriangleGlb(){
  const compressed=Uint8Array.from(atob('oAAAATwAAAD//wE8AAAAfn0AAAEMAAAA/wEMAAAAfgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='),char=>char.charCodeAt(0));
  const document={asset:{version:'2.0'},extensionsUsed:['EXT_meshopt_compression'],extensionsRequired:['EXT_meshopt_compression'],
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],
    materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,.2,.05,1],metallicFactor:0}}],
    buffers:[{byteLength:compressed.byteLength}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36,byteStride:12,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:0,byteLength:compressed.byteLength,byteStride:12,count:3,mode:'ATTRIBUTES',filter:'NONE'}}}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
  const json=new TextEncoder().encode(JSON.stringify(document)),jsonLength=Math.ceil(json.length/4)*4,binLength=Math.ceil(compressed.length/4)*4;
  const result=new Uint8Array(28+jsonLength+binLength),view=new DataView(result.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,result.length,true);
  view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);result.fill(32,20,20+jsonLength);result.set(json,20);
  view.setUint32(20+jsonLength,binLength,true);view.setUint32(24+jsonLength,0x004e4942,true);result.set(compressed,28+jsonLength);
  return result;
}
