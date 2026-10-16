import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {updateVoiceOverlay} from '../public/js/voice-avatar-overlay.js';

test('avatar microphone badges reflect real levels and expire captions without changing position',()=>{
 const old=globalThis.document,drawn=[];
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},fillRect(){},fillText(text){drawn.push(text);},measureText:text=>({width:text.length*12})})})};
 try{
  const root=new THREE.Group();root.position.set(3,0,7);
  const user={voiceEnabled:true,voiceCaption:'Hello space',voiceCaptionAt:1000};
  updateVoiceOverlay(THREE,root,user,0,1000);const badge=root.userData.roomVoiceOverlay;
  assert.ok(badge.visible);assert.ok(drawn.includes('● MIC READY'));assert.ok(drawn.includes('Hello space'));
  const quiet=badge.userData.bars[2].scale.y;
  updateVoiceOverlay(THREE,root,user,.8,1100);assert.ok(badge.userData.bars[2].scale.y>quiet);
  updateVoiceOverlay(THREE,root,user,0,8000);assert.equal(badge.userData.caption,'');
  updateVoiceOverlay(THREE,root,{voiceEnabled:false});assert.equal(badge.visible,false);
  assert.deepEqual(root.position.toArray(),[3,0,7]);
  root.traverse(object=>{object.geometry?.dispose();object.material?.map?.dispose();object.material?.dispose();});
 }finally{globalThis.document=old;}
});
