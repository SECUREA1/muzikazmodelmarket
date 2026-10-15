import {SharedGameInventory} from './shared-game-inventory.js';
export function connectAuthoritativeRoom({roomId,input,render,onStatus}){
 const api=new SharedGameInventory();let stopped=false,busy=false,session=null,joined=false,sequence=-1;
 const client={ready:false,selfId:null,async send(action,fields={}){
  if(stopped)throw Error('Room closed.');
  session ||= await api.session();
  const state=await api.api('/api/rooms/'+encodeURIComponent(roomId)+'/gameplay',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify({...fields,action,requestId:crypto.randomUUID()})});
  if(stopped)return;client.selfId=state.selfId||client.selfId;if(state.sequence>=sequence){sequence=state.sequence;render(state,client.selfId);}client.ready=true;return state;
 },async object(command){if(!client.ready)throw Error('Waiting for the server. Placement preview has not been saved.');session ||= await api.session();await api.api('/api/rooms/'+encodeURIComponent(roomId)+'/objects',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(command)});const state=await api.api('/api/rooms/'+encodeURIComponent(roomId)+'/gameplay');if(!stopped&&state.sequence>=sequence){sequence=state.sequence;render(state,client.selfId);}return state;},stop(){stopped=true;client.ready=false;clearInterval(timer);}};
 async function tick(){if(stopped||busy)return;busy=true;try{if(!joined){await client.send('join');joined=true;}else{const controls=document.hidden?{}:input();await client.send('input',{input:controls});if(controls.firing)await client.send('fire',{tool:controls.tool,direction:controls.direction,color:controls.color});}}catch(error){if([400,403,422,429].includes(error.status)){onStatus?.(error.message);}else{client.ready=false;joined=false;session=null;onStatus?.('Server connection required: '+error.message);}}finally{busy=false;}}
 const timer=setInterval(tick,150);tick();return client;
}
export function projectSharedBuildings({THREE,system,records,create}){
 const active=new Set();
 for(const record of Object.values(records||{})){
  if(record.deleted)continue;active.add(record.id);
  let root=system.bricks.find(root=>root.userData.sharedId===record.id);
  if(system.buildEditor.pending?.root===root&&root)continue;
  if(!root){root=create(record.materialId);root.userData={...root.userData,brick:true,hits:0,maxHits:5,locked:true,sharedId:record.id};system.brickGroup.add(root);system.bricks.push(root);}
  root.position.fromArray(record.position);root.rotation.set(...record.rotation);root.scale.fromArray(record.scale);root.userData.buildScale=root.scale.clone();root.userData.sharedRevision=record.revision;root.userData.sharedOwner=record.ownerId;
  let index=0;root.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.color){const color=record.paint[index++];if(color!==undefined)mesh.material.color.setHex(color);}});
  if(!!root.userData.open!==record.open)system.toggleSharedDoor?.(root);
 }
 for(const root of [...system.bricks])if(root.userData.sharedId&&!active.has(root.userData.sharedId)&&system.buildEditor.pending?.root!==root){root.removeFromParent();system.bricks=system.bricks.filter(item=>item!==root);}
}
export function buildingCommand(root){const paint=[];root.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.color)paint.push(mesh.material.color.getHex());});return {id:root.userData.sharedId||crypto.randomUUID(),revision:root.userData.sharedRevision||0,object:{materialId:root.userData.materialId,position:root.position.toArray(),rotation:[root.rotation.x,root.rotation.y,root.rotation.z],scale:root.scale.toArray(),paint,open:!!root.userData.open}};}
