// Keep the catalogue and selected-item workspace side by side on phones.
export function mountBuildingMaterialWorkspace(panel){
 const layout=panel.querySelector('.building-design-layout'),list=layout.firstElementChild;
 panel.classList.add('building-material-workspace');list.classList.add('building-material-sidebar');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='building-material-menu';toggle.setAttribute('aria-label','Show or hide building items');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-controls','building-material-list');toggle.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Items</span>';
 const catalogue=document.createElement('div');catalogue.id='building-material-list';catalogue.className='building-material-list';
 for(const selector of ['[data-building-types-toggle]','[data-building-types]','[data-building-search]','[data-building-result-count]']){const element=panel.querySelector(selector);if(element)catalogue.append(element.matches('input')?element.closest('label'):element);}
 catalogue.append(panel.querySelector('.rad-brick-material-grid'));list.append(toggle,catalogue);
 toggle.addEventListener('click',()=>{const collapsed=panel.classList.toggle('building-items-collapsed');toggle.setAttribute('aria-expanded',String(!collapsed));if(collapsed&&catalogue.contains(document.activeElement))toggle.focus();});
 return {toggle,catalogue};
}
