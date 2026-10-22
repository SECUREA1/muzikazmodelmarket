import {fullscreenPanel} from './fullscreen-panels.js';
import {createYachtBilliards,YACHT_TABLE} from './yacht-billiards.js';
import {hasWalkableInterior} from './harbor-water.js';
export function mountYachtGames({THREE,stage,getRoots,getActors,getPosition,getVehicleId,send,announce=()=>{},onOpen=()=>{}}){
 const panel=document.createElement('section');panel.className='yacht-game-panel';panel.hidden=true;panel.setAttribute('aria-label','Yacht billiards');panel.innerHTML='<p>Aim along the guide on the table. Choose power and take a shot. Everyone aboard sees the same balls.</p><p data-score aria-live="polite"></p><label>Aim <output data-angle>0°</output><input aria-label="Shot angle" data-aim type="range" min="-180" max="180" value="0" step="1"></label><label>Power <output data-power>60%</output><input aria-label="Shot power" data-strength type="range" min="10" max="100" value="60"></label><button data-shoot>Take shot</button><button data-rack>Rack new game</button><button data-close>Return to walking</button>';stage.append(panel);
 const aim=panel.querySelector('[data-aim]'),power=panel.querySelector('[data-strength]'),score=panel.querySelector('[data-score]'),shoot=panel.querySelector('[data-shoot]'),rack=panel.querySelector('[data-rack]');let current=null,nearby=null,pending=false;
 const clear=()=>{if(current)current.root.userData.yachtAim=null;current=null;};
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();onOpen();},onClose:clear});
 function close(){clear();screen.close();}
 function open(){update();if(!nearby||document.querySelector('dialog[open]'))return false;current=nearby;screen.open();update();return true;}
 panel.querySelector('[data-close]').onclick=close;
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

  if(!current)return;
  if(!nearby||nearby.id!==current.id){close();return;}
  const actor=getActors()[current.id],state=actor.yachtBilliards||createYachtBilliards(),moving=state.moving||Math.abs(actor.boating?.speed||0)>.1;
  const message=state.score+' points · '+state.shots+' shots · '+(Math.abs(actor.boating?.speed||0)>.1?'Anchor before playing.':state.message);if(score.textContent!==message)score.textContent=message;
  shoot.disabled=rack.disabled=pending||moving;current.root.userData.yachtAim=Number(aim.value)*Math.PI/180;
 }
 return {update,open,available(){update();return Boolean(nearby)&&!screen.dialog.open;},presentCamera(camera,rig){
  if(!current||!screen.dialog.open)return false;
  current.root.updateWorldMatrix(true,false);rig.updateWorldMatrix(true,false);
  const eye=current.root.localToWorld(new THREE.Vector3(2.4,4.4,11.5)),target=current.root.localToWorld(new THREE.Vector3(2.4,3.25,7.8));
  camera.position.copy(camera.parent?camera.parent.worldToLocal(eye):eye);camera.up.set(0,1,0);camera.lookAt(target);camera.updateMatrixWorld(true);return true;
 },reset:close,dispose(){close();screen.disconnect();screen.dialog.remove();}};
}
