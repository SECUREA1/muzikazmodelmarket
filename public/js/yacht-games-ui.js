import {createYachtBilliards,YACHT_TABLE} from './yacht-billiards.js';
import {hasWalkableInterior} from './harbor-water.js';
export function mountYachtGames({THREE,stage,getRoots,getActors,getPosition,getVehicleId,send,announce=()=>{}}){
 const style=document.createElement('style');style.textContent=`.yacht-game-entry{position:absolute;left:18px;bottom:150px;z-index:35;padding:12px 18px;background:#174e50;color:white;border:1px solid #85e3d4;border-radius:12px;font-weight:700}.yacht-game-panel{position:absolute;inset:80px 16px auto auto;margin:0;width:min(290px,calc(100% - 32px));box-sizing:border-box;max-height:calc(100% - 100px);overflow:auto;padding:20px;background:#102c36ee;color:#effffb;border:1px solid #8acaba;border-radius:14px;z-index:70}.yacht-game-panel h2{margin:0 0 12px;font-size:20px}.yacht-game-panel label{display:block;margin:15px 0}.yacht-game-panel input{display:block;width:100%;margin-top:8px}.yacht-game-panel button{padding:10px;margin:6px 5px 0 0;background:#236461;border:1px solid #75c9bd;color:white;border-radius:8px}.yacht-game-panel p{font-size:14px;line-height:1.5}`;stage.append(style);
 const entry=document.createElement('button');entry.className='yacht-game-entry';entry.dataset.yachtBilliards='';entry.textContent='Play billiards';entry.hidden=true;stage.append(entry);
 const panel=document.createElement('dialog');panel.className='yacht-game-panel';panel.setAttribute('aria-label','Yacht billiards');panel.innerHTML='<h2>Yacht billiards</h2><p>Aim along the guide on the table. Choose power and take a shot. Everyone aboard sees the same balls.</p><p data-score aria-live="polite"></p><label>Aim <output data-angle>0°</output><input aria-label="Shot angle" data-aim type="range" min="-180" max="180" value="0" step="1"></label><label>Power <output data-power>60%</output><input aria-label="Shot power" data-strength type="range" min="10" max="100" value="60"></label><button data-shoot>Take shot</button><button data-rack>Rack new game</button><button data-close>Return to walking</button>';stage.append(panel);
 const aim=panel.querySelector('[data-aim]'),power=panel.querySelector('[data-strength]'),score=panel.querySelector('[data-score]'),shoot=panel.querySelector('[data-shoot]'),rack=panel.querySelector('[data-rack]');let current=null,nearby=null,pending=false;
 function close(){if(current)current.root.userData.yachtAim=null;current=null;if(panel.open)panel.close();}
 entry.onclick=()=>{if(!nearby)return;current=nearby;document.exitPointerLock?.();panel.show();update();};
 panel.querySelector('[data-close]').onclick=close;panel.addEventListener('cancel',close);panel.addEventListener('close',()=>{if(current)current.root.userData.yachtAim=null;current=null;});
 aim.oninput=()=>{panel.querySelector('[data-angle]').textContent=aim.value+'°';update();};power.oninput=()=>{panel.querySelector('[data-power]').textContent=power.value+'%';};
 async function command(operation){if(!current||pending)return;const actor=getActors()[current.id],state=actor?.yachtBilliards||createYachtBilliards();pending=true;update();try{await send('yacht-game',{entityId:current.id,operation,revision:state.revision,angle:Number(aim.value)*Math.PI/180,power:Number(power.value)/100});}catch(error){announce(error.message);}finally{pending=false;update();}}
 shoot.onclick=()=>command('shoot');rack.onclick=()=>command('rack');
 function update(){
  nearby=null;
  if(!getVehicleId())for(const root of getRoots()){
   const id=root.userData.builderObjectId,actor=getActors()[id];if(!hasWalkableInterior(actor)||actor.active===false)continue;
   root.updateWorldMatrix(true,false);const local=root.worldToLocal(new THREE.Vector3().copy(getPosition()));
   if(local.y>=1.8&&local.y<3&&Math.hypot(local.x-YACHT_TABLE.x,local.y-YACHT_TABLE.y,local.z-YACHT_TABLE.z)<=4){nearby={id,root};break;}
  }
  entry.hidden=!nearby||panel.open;
  if(!current)return;
  if(!nearby||nearby.id!==current.id){close();return;}
  const actor=getActors()[current.id],state=actor.yachtBilliards||createYachtBilliards(),moving=state.moving||Math.abs(actor.boating?.speed||0)>.1;
  const message=state.score+' points · '+state.shots+' shots · '+(Math.abs(actor.boating?.speed||0)>.1?'Anchor before playing.':state.message);if(score.textContent!==message)score.textContent=message;
  shoot.disabled=rack.disabled=pending||moving;current.root.userData.yachtAim=Number(aim.value)*Math.PI/180;
 }
 return {update,presentCamera(camera,rig){
  if(!current||!panel.open)return false;
  current.root.updateWorldMatrix(true,false);rig.updateWorldMatrix(true,false);
  const eye=current.root.localToWorld(new THREE.Vector3(2.4,4.4,11.5)),target=current.root.localToWorld(new THREE.Vector3(2.4,3.25,7.8));
  camera.position.copy(camera.parent?camera.parent.worldToLocal(eye):eye);camera.up.set(0,1,0);camera.lookAt(target);camera.updateMatrixWorld(true);return true;
 },reset:close,dispose(){close();entry.remove();panel.remove();style.remove();}};
}
