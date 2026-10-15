import {SharedGameInventory,signalInventoryChange} from './shared-game-inventory.js';
const api=new SharedGameInventory();
export async function downloadGameplayItem(itemId){
 const file=await api.api('/api/backpack/items/'+encodeURIComponent(itemId)+'/export');
 const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'})),link=document.createElement('a');
 link.href=url;link.download='muzikaz-'+itemId.replace(/[^a-z0-9-]/gi,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function mountGameplayFiles(root){
 if(root.dataset.gameplayFilesMounted)return root.querySelector('input[data-gameplay-upload]');root.dataset.gameplayFilesMounted='true';
 const input=document.createElement('input');input.dataset.gameplayUpload='true';input.type='file';input.accept='.json,application/json';input.hidden=true;root.append(input);
 const status=root.querySelector('[data-gameplay-file-status]')||root.querySelector('[data-backpack-status]');
 input.addEventListener('change',async()=>{try{const file=input.files[0];if(!file)return;if(file.size>8500000)throw Error('Choose a gameplay package smaller than 8 MB.');const payload=JSON.parse(await file.text()),session=await api.session();const result=await api.api('/api/backpack/import',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(payload)});signalInventoryChange();if(status)status.textContent=result.action==='visit'?'Opening shared multiplayer destination.':'Opening your item from its live server record.';let destination=result.playUrl;if(result.action!=='builder'&&(result.item.modelUrl||result.item.renderKind||['land-deed','land-entitlement'].includes(result.item.type)))destination=(await api.useBackpack(result.item.id)).playUrl;location.href=destination;}catch(error){if(status)status.textContent=error.message;}finally{input.value='';}});
 root.addEventListener('click',async event=>{const download=event.target.closest('[data-gameplay-download]');if(download){download.disabled=true;try{await downloadGameplayItem(download.dataset.gameplayDownload);}catch(error){if(status)status.textContent=error.message;}finally{download.disabled=false;}}if(event.target.closest('[data-gameplay-import]'))input.click();});
 return input;
}
if(typeof document!=='undefined'){
 const panel=document.createElement('section');panel.className='gameplay-file-panel';panel.innerHTML='<h3>Reusable gameplay files</h3><p>Download an owned item, custom build, or deed with its saved configuration. Import it to reopen the current server version. Ownership and trades stay on the server.</p><button type="button" data-gameplay-import>Open gameplay file</button><p role="status" data-gameplay-file-status></p>';
 const parent=document.querySelector('#custom-item-library')||document.querySelector('#owned-collection')||document.querySelector('[data-builder-panel="backpack"]');
 if(parent){parent.prepend(panel);mountGameplayFiles(document.body);}
}
