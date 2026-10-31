import {previewDescriptor,previewModelSource} from './market-item-preview.js?v=forge-atelier-20261031';
import {productShareUrl,shareProduct} from './product-share.js';

// Only the selected product owns these controls. Neither sharing nor opening
// the inspector starts catalog polling or creates a background 3D renderer.
export function mountProductActions(row,record){
 const figure=row.querySelector('[data-item-preview]');if(!figure)return {dispose(){}};
 const item=previewDescriptor(record),bar=document.createElement('div');bar.className='market-product-actions';bar.setAttribute('role','group');bar.setAttribute('aria-label',item.name+' preview and sharing');
 const make=label=>{const button=document.createElement('button');button.type='button';button.textContent=label;bar.append(button);return button;};
 const view=make(previewModelSource(item)==='card'?'View product card':'View in 3D'),ar=make('View in AR'),share=make('Share product'),status=document.createElement('p');status.setAttribute('role','status');bar.append(status);
 const url=productShareUrl(record);if(url){const link=document.createElement('a');link.href=url;link.textContent='Product page';bar.append(link);}
 figure.after(bar);const owner={};let disposed=false,previewModule=null,opened=false;
 const show=async(mode,button)=>{
  button.disabled=true;status.textContent='Opening product preview…';
  try{previewModule=await import('./product-preview.js?v=forge-atelier-20261031');if(disposed)return;opened=true;await previewModule.openProductPreview(record,{mode,owner});if(!disposed)status.textContent='';}
  catch(error){if(!disposed)status.textContent=error.message||'This preview is unavailable. Try again.';}
  finally{if(!disposed)button.disabled=false;}
 };
 view.addEventListener('click',()=>show('3d',view));ar.addEventListener('click',()=>show('ar',ar));
 share.addEventListener('click',async()=>{
  share.disabled=true;
  try{
   const result=await shareProduct(record);if(disposed)return;
   if(result.canceled)status.textContent='Sharing canceled.';
   else if(result.method==='clipboard')status.textContent='Product link copied.';
   else if(result.method==='share')status.textContent='Product share sheet opened.';
   else if(result.url){
    status.textContent='Copy this product link:';const input=document.createElement('input');input.readOnly=true;input.value=result.url;input.setAttribute('aria-label','Product link');status.append(input);input.select();
   }else status.textContent='This item needs a public listing before it can be shared.';
  }catch(error){if(!disposed)status.textContent=error.message||'The product link could not be shared.';}
  finally{if(!disposed)share.disabled=false;}
 });
 return {dispose(){disposed=true;if(opened&&previewModule)previewModule.closeProductPreview({owner});bar.remove();}};
}
