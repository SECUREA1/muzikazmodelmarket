import {materialBulkQuote} from './game-item-pricing.js';
// Checkout uses the existing inventory APIs and their settlement receipts.
export async function buyLockedItem(inventory,item){
 if(!item?.sku)throw Error('Open the marketplace to load this item.');
 if(item.kind==='material'){const quote=materialBulkQuote(item,1);return inventory.buyMaterials(item.sku,1,quote.priceMzk);}
 return inventory.economyAction('buy',item.sku);
}
export function createItemUnlockPrompt({getItem,inventory,onMarket,onPurchased}){
 const dialog=document.createElement('dialog');dialog.className='item-unlock-prompt';dialog.setAttribute('aria-labelledby','item-unlock-title');
 dialog.innerHTML='<h2 id="item-unlock-title">Unlock item</h2><p data-unlock-description></p><p data-unlock-price></p><p data-unlock-status role="status" aria-live="polite"></p><div><button type="button" data-unlock-buy>Buy now</button><button type="button" data-unlock-market>View in marketplace</button><button type="button" data-unlock-cancel>Keep browsing</button></div>';
 let sku=null,busy=false;
 const buy=dialog.querySelector('[data-unlock-buy]'),market=dialog.querySelector('[data-unlock-market]'),cancel=dialog.querySelector('[data-unlock-cancel]'),status=dialog.querySelector('[data-unlock-status]');
 const close=()=>{if(!busy)dialog.close();};cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.stopPropagation();if(busy)event.preventDefault();});
 market.onclick=()=>{if(busy)return;const target=sku;dialog.close();onMarket(target);};
 buy.onclick=async()=>{if(busy||!sku)return;const target=sku,item=getItem(target);if(!item)return;busy=true;buy.disabled=market.disabled=cancel.disabled=true;status.textContent='Completing your purchase…';
  try{await buyLockedItem(inventory,item);dialog.close();await onPurchased(target,item);}
  catch(error){status.textContent=error.message||'Purchase could not be completed. Try again or view the item in the marketplace.';}
  finally{busy=false;buy.disabled=!getItem(sku);market.disabled=cancel.disabled=false;}
 };
 return {dialog,open(target){if(busy)return;sku=target;const item=getItem(sku);dialog.querySelector('h2').textContent=item?.name||'Unlock item';dialog.querySelector('[data-unlock-description]').textContent=item?.kind==='material'?'Buy one prepaid piece, then place it in your world.':'Unlock this item in your Backpack to use it in your world.';dialog.querySelector('[data-unlock-price]').textContent=item?(item.kind==='material'?`${item.unitPriceMzk} MZK · 1 piece`:`${item.priceMzk} MZK${item.useCostMzk?` · ${item.useCostMzk} MZK per use`:''}`):'View this item in the marketplace for current availability and price.';status.textContent='';buy.disabled=!item;buy.textContent=item?`Buy now · ${item.kind==='material'?item.unitPriceMzk:item.priceMzk} MZK`:'Buy now';(document.fullscreenElement||document.body).append(dialog);if(!dialog.open)dialog.showModal();}};
}
