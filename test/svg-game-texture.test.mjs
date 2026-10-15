import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSvgGameTexture} from '../public/js/svg-game-texture.js';
test('SVG decode succeeds or fails promptly and always releases its object URL',async()=>{
 const oldImage=globalThis.Image,oldDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 let mode='ok',released=0;
 globalThis.Image=class{set src(value){if(mode==='ok')queueMicrotask(()=>this.onload?.());if(mode==='bad')queueMicrotask(()=>this.onerror?.());}};
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>released++;
 const THREE={CanvasTexture:class{constructor(canvas){this.image=canvas;}},SRGBColorSpace:'srgb'};
 try{
  const texture=await loadSvgGameTexture({THREE,markup:'<svg/>',size:128});assert.equal(texture.image.width,128);assert.equal(texture.colorSpace,'srgb');
  mode='bad';await assert.rejects(loadSvgGameTexture({THREE,markup:'bad',size:128}),/could not be decoded/);
  mode='stuck';await assert.rejects(loadSvgGameTexture({THREE,markup:'<svg/>',size:128,timeoutMs:15}),/too long/);assert.equal(released,3);
 }finally{globalThis.Image=oldImage;globalThis.document=oldDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
