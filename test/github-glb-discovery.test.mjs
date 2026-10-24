import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeGitHubAvatarFiles,mergeGitHubEnvironmentFiles} from '../public/js/github-glb-discovery.js';

const file=path=>({path,url:'https://raw.githubusercontent.com/example/models/main/'+path.split('/').map(encodeURIComponent).join('/'),format:'glb',size:100});

test('model discovery preserves existing catalogue identities for encoded filenames',()=>{
 const avatar={id:'rebel',name:'Rebel',modelUrl:'/public/models/avatars/rebel%20black%20sheep.glb'},vehicle={id:'drone',modelUrl:'/public/models/vehicles/DRONE%20ENGINE.glb'};
 const records=[avatar,vehicle],files=[file('public/models/avatars/rebel black sheep.glb'),file('public/models/vehicles/DRONE ENGINE.glb')];
 assert.deepEqual(mergeGitHubAvatarFiles(records,files),records);
 assert.strictEqual(mergeGitHubAvatarFiles(records,files)[0],avatar,'saved IDs and metadata remain authoritative');
});

test('environment discovery normalizes every part of a multi-model destination',()=>{
 const environment={id:'saved-house',modelUrl:'/public/models/environments/main%20house.glb',modelUrls:['https://cdn.example/public/models/environments/upper%20floor.glb']};
 const files=[file('public/models/environments/main house.glb'),file('public/models/environments/upper floor.glb'),file('public/models/avatars/new mascot.glb')];
 assert.deepEqual(mergeGitHubEnvironmentFiles([environment],files),[environment]);
 const avatars=mergeGitHubAvatarFiles([],files);
 assert.equal(avatars.length,1);assert.equal(avatars[0].name,'New Mascot');assert.equal(avatars[0].source,'github-repository');
});

test('a literal percent in a model filename does not stop the discovery feed',()=>{
 const record={id:'percentage',modelUrl:'/public/models/avatars/100%25%20ready.glb'},files=[file('public/models/avatars/100% ready.glb'),file('public/models/avatars/new.glb')];
 const models=mergeGitHubAvatarFiles([record],files);
 assert.equal(models.length,2);assert.strictEqual(models[0],record);assert.equal(models[1].name,'New');
});
