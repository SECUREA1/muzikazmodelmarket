import {SharedGameInventory,signalInventoryChange} from './shared-game-inventory.js';
import {requestGameInputRelease} from './game-input-release.js';

export function mountLandSale(stage){
 const inventory=new SharedGameInventory(),dialog=document.createElement('dialog');dialog.className='land-sale-dialog';dialog.setAttribute('aria-label','Review land deed');
 const style=document.createElement('style');style.textContent='.land-sale-dialog{box-sizing:border-box;width:420px;max-width:calc(100vw - 24px);padding:24px;border:1px solid #b2c57f;border-radius:18px;background:#112b21;color:#eff6df;font:14px/1.6 system-ui}.land-sale-dialog [hidden]{display:none!important}.land-sale-dialog::backdrop{background:#00170dcc}.land-sale-dialog h2{margin:8px 0}.land-sale-dialog button,.land-sale-dialog a{display:inline-block;min-height:44px;box-sizing:border-box;padding:10px 14px;margin:6px 5px 0 0;border:1px solid #82a36e;border-radius:9px;background:#214431;color:#f2ffe2;text-decoration:none;cursor:pointer}.land-sale-dialog [data-buy]{background:#c1ed86;color:#17311e;font-weight:800}.land-sale-dialog p{overflow-wrap:anywhere}.land-sale-dialog button:disabled{opacity:.55}';stage.append(style,dialog);
 let generation=0,busy=false,dialogActive=false,returnFocus=null,restoreFocus=true,disposed=false;
 function finishClose(){
  if(dialog.open||!dialogActive)return;
  dialogActive=false;generation++;busy=false;requestGameInputRelease('land-panel-close');
  const focused=document.activeElement;
  if(restoreFocus&&!document.querySelector('dialog:modal')&&(focused===returnFocus||focused===document.body||dialog.contains(focused)))stage.querySelector('canvas')?.focus({preventScroll:true});
 }
 function close(){if(dialog.open)dialog.close();finishClose();}
 function reset(){generation++;busy=false;restoreFocus=false;close();}
 dialog.addEventListener('close',finishClose);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 async function open(id){
  if(disposed)return false;
  const current=++generation;busy=false;
  if(!dialog.open){dialogActive=true;restoreFocus=true;returnFocus=document.activeElement;requestGameInputRelease('land-panel-open');}
  dialog.replaceChildren();
  const title=document.createElement('h2'),detail=document.createElement('p'),status=document.createElement('p'),buy=document.createElement('button'),visit=document.createElement('a'),dismiss=document.createElement('button');
  title.textContent='Review land deed';status.setAttribute('role','status');status.textContent='Loading current ownership and price…';buy.type=dismiss.type='button';buy.hidden=visit.hidden=true;dismiss.textContent='Close';dismiss.onclick=close;dialog.append(title,detail,status,buy,visit,dismiss);
  if(!dialog.open)dialog.showModal();
  try{
   const lot=await inventory.api('/api/land/lots/'+encodeURIComponent(id));if(current!==generation||!dialog.open)return;
   title.textContent=lot.name;detail.textContent=lot.size+' × '+lot.size+' metres · '+lot.priceMzk.toLocaleString()+' MZK ($'+lot.priceUsd+') · '+lot.mapId+' · Local XYZ '+lot.position.x+', '+lot.position.y+', '+lot.position.z;
   status.textContent=lot.claimed?'Deed claimed · '+(lot.ownerName||'MUZIKAZ member'):'Available. Purchase transfers the full lot deed to your member wallet.';
   visit.hidden=false;visit.textContent=lot.claimed?'Enter deeded plot':'Visit staked lot';visit.href=lot.playUrl||lot.visitUrl;buy.hidden=lot.claimed;buy.textContent='Buy deed · '+lot.priceMzk.toLocaleString()+' MZK';
   buy.onclick=async()=>{
    if(busy||current!==generation)return;busy=true;buy.disabled=true;const requestId=crypto.randomUUID();
    try{
     const session=await inventory.session();
     if(current!==generation||!dialog.open)return;
     const deed=await inventory.api('/api/land/claims',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify({worldId:lot.id,expectedPriceMzk:lot.priceMzk,requestId})});signalInventoryChange();
     if(current!==generation||!dialog.open)return;
     buy.hidden=true;status.textContent='Deed purchased. Your lot coordinates are saved in your Backpack.';visit.href=deed.playUrl;visit.textContent='Enter your deeded plot';
    }catch(error){if(current===generation)status.textContent=error.message;}
    finally{if(current===generation){busy=false;buy.disabled=false;}}
   };
  }catch(error){if(current===generation)status.textContent=error.message;}
 }
 return {open,reset,dispose(){reset();disposed=true;dialog.remove();style.remove();}};
}
