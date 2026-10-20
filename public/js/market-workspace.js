import {previewDescriptor,safePreviewUrl} from './market-item-preview.js';
import {mountMarketPreviewTuner} from './market-preview-tuner.js';
const instances=new WeakMap();
const icon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
// Keep original sale forms/buttons and their delegated handlers intact.
export function organizeMarketWorkspace(root,{rowSelector,records=[],titleSelector='h3,strong'}={}){
 let state=instances.get(root);const rows=[...root.querySelectorAll(rowSelector)];
 if(!rows.length){state?.dispose?.();return;}
 if(!state||!root.contains(state.node)){
  const priorKey=state?.selectedKey;state?.dispose?.();const node=document.createElement('div');node.className='market-workspace';
  const sidebar=document.createElement('aside');sidebar.className='market-workspace-sidebar';const toggle=document.createElement('button');toggle.type='button';toggle.className='market-workspace-toggle';toggle.innerHTML=icon+'<span>Items</span>';toggle.setAttribute('aria-label','Show or hide marketplace items');toggle.setAttribute('aria-expanded','true');
  const list=document.createElement('div');list.className='market-workspace-list';list.setAttribute('role','group');list.setAttribute('aria-label','Marketplace items');
  const pager=document.createElement('div');pager.className='market-workspace-pager';const previous=document.createElement('button'),next=document.createElement('button'),slider=document.createElement('input'),count=document.createElement('output');previous.type=next.type='button';previous.textContent='‹';next.textContent='›';previous.setAttribute('aria-label','Previous market item');next.setAttribute('aria-label','Next market item');slider.type='range';slider.min='1';slider.setAttribute('aria-label','Browse market items');pager.append(previous,slider,next,count);sidebar.append(toggle,list,pager);
  const detail=document.createElement('section');detail.className='market-workspace-detail';detail.setAttribute('aria-label','Selected item preview and sale');node.append(sidebar,detail);root.append(node);
  state={node,list,detail,slider,count,previous,next,selectedKey:priorKey||null,tuner:null};instances.set(root,state);
  toggle.onclick=()=>{const collapsed=node.classList.toggle('is-list-collapsed');toggle.setAttribute('aria-expanded',String(!collapsed));};
  state.dispose=()=>{state.tuner?.dispose();state.tuner=null;state.selectedRow=null;};
 }
 for(const row of rows)if(row.parentElement!==state.detail)state.detail.append(row);
 const choices=rows.map((row,index)=>({row,record:records[index]||{},index})).filter(({row})=>!row.hidden);
 const key=entry=>entry.record.sku||[entry.record.source||'',entry.record.sellerId||'',entry.record.itemId||entry.record.id||entry.index].join(':');
 let selected=choices.findIndex(entry=>key(entry)===state.selectedKey);if(selected<0)selected=0;
 const select=index=>{
  if(!choices.length){rows.forEach(row=>row.classList.remove('is-market-selected'));state.list.replaceChildren();state.dispose();state.node.hidden=true;return;}
  index=Math.max(0,Math.min(choices.length-1,index));const entry=choices[index];state.node.hidden=false;rows.forEach(row=>row.classList.toggle('is-market-selected',row===entry.row));
  state.slider.max=String(choices.length);state.slider.value=String(index+1);state.slider.disabled=choices.length<2;state.count.textContent=`${index+1} / ${choices.length}`;state.previous.disabled=index===0;state.next.disabled=index===choices.length-1;
  [...state.list.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  if(state.selectedRow!==entry.row){state.tuner?.dispose();state.tuner=mountMarketPreviewTuner(entry.row,entry.record);state.selectedRow=entry.row;}
  state.selectedKey=key(entry);
 };
 state.list.replaceChildren(...choices.map((entry,index)=>{const button=document.createElement('button');button.type='button';button.className='market-workspace-item';const descriptor=previewDescriptor(entry.record),image=safePreviewUrl(descriptor.image);if(image){const img=document.createElement('img');img.src=image;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();button.append(img);}const copy=document.createElement('span'),title=document.createElement('strong'),category=document.createElement('small');title.textContent=entry.row.querySelector(titleSelector)?.textContent||descriptor.name;category.textContent=descriptor.category;copy.append(title,category);button.append(copy);button.onclick=()=>select(index);return button;}));
 state.slider.oninput=()=>select(Number(state.slider.value)-1);state.previous.onclick=()=>select(Number(state.slider.value)-2);state.next.onclick=()=>select(Number(state.slider.value));select(selected);
 if(!document.querySelector('[data-market-workspace-style]')){const link=document.createElement('link');link.rel='stylesheet';link.dataset.marketWorkspaceStyle='';link.href=new URL('../assets/market-workspace.css',import.meta.url).href;document.head.append(link);}
 return state;
}
export function releaseMarketWorkspacePreview(root){instances.get(root)?.dispose();}
