const compact=value=>String(value||'').replace(/\s+/g,' ').trim();
const short=value=>compact(value).slice(0,90);
const controlSelector='button,[role="button"]:not(a),input[type="button"],input[type="submit"],input[type="reset"],input[type="checkbox"],input[type="radio"],input[type="number"],input[type="range"],select,summary';
const ignoredSelector='[data-xr-exclude],model-viewer,.market-preview-tuning,.model-preview-controls,[data-flame-fire],[data-hold="true"],[data-xr-hold]';
const sensitiveField=/password|passcode|payment|credit.?card|card.?number|cvv|cvc|wallet|address|postal|routing|iban|private.?key|seed|secret|token|email|phone|username/i;

function visible(node){
 if(!node?.isConnected||node.hidden||node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
 for(let ancestor=node.parentElement;ancestor;ancestor=ancestor.parentElement){
  if(ancestor.localName==='details'&&!ancestor.open&&!ancestor.querySelector('summary')?.contains(node))return false;
 }
 if(!node.getClientRects().length)return false;
 if(node.checkVisibility&&!node.checkVisibility({visibilityProperty:true,opacityProperty:true}))return false;
 const view=node.ownerDocument?.defaultView,style=view?.getComputedStyle(node);
 return style?.display!=='none'&&style?.visibility!=='hidden'&&style?.visibility!=='collapse';
}
function enabled(node){return visible(node)&&!node.disabled&&!node.matches?.(':disabled')&&node.getAttribute('aria-disabled')!=='true';}
function labelText(label){const clone=label.cloneNode(true);clone.querySelectorAll('input,select,textarea,button').forEach(node=>node.remove());return compact(clone.textContent);}
function labelled(node){
 const document=node.ownerDocument,ids=compact(node.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
 return short(node.getAttribute('aria-label')||ids.map(id=>document.getElementById(id)?.textContent||'').join(' ')||
  [...(node.labels||[])].map(labelText).join(' ')||node.getAttribute('title')||
  (node.localName==='input'?node.value:node.innerText||node.textContent));
}
function safeLabel(node){
 // Text input values are never copied into the headset. A numeric control must
 // have an authored label rather than exposing a card/account-like identifier.
 const authored=node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||[...(node.labels||[])].map(labelText).join(' ')||node.title||'';
 if(!compact(authored)||sensitiveField.test([authored,node.id,node.name,node.autocomplete].join(' ')))return '';
 return labelled(node);
}
function ownerDocument(root){return root.nodeType===9?root:root.ownerDocument;}

/** Adapt the real game panel controls to the existing spatial menu. No gameplay
 * outcome, purchase or ownership decision is implemented by this adapter. */
export function xrPanelActions({root=globalThis.document,excludeIds=[],onInvoke=()=>{},navigate=null,maxActions=Infinity}={}){
 const excluded=new Set(excludeIds),document=ownerDocument(root);
 const controlIds=new WeakMap();let nextControlId=0;
 const contains=node=>node&&((root.nodeType===9&&node.ownerDocument===root)||root===node||root.contains(node));
 function excludedDialog(dialog){
  if(dialog.closest('[data-xr-exclude]'))return true;
  if(excluded.has(dialog.id))return true;
  return [...dialog.querySelectorAll('[id]')].some(node=>excluded.has(node.id));
 }
 function panel(){
  const selector='dialog[open],[role="dialog"][aria-modal="true"]',candidates=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)]
   .filter(node=>visible(node)&&(node.dataset.gameplayBlocking!=='false'||node.matches?.(':modal')));
  const focused=document.activeElement?.closest(selector);
  if(candidates.includes(focused))return excludedDialog(focused)?null:focused;
  const modals=candidates.filter(node=>node.matches?.(':modal'));
  const selected=modals.at(-1)||candidates.at(-1)||null;
  return selected&&!excludedDialog(selected)?selected:null;
 }
 function usable(dialog,node){return contains(dialog)&&panel()===dialog&&dialog.contains(node)&&enabled(node)&&!node.closest(ignoredSelector);}
 function notify(dialog,node,kind){return onInvoke({dialog,control:node,kind});}
 function close(dialog=panel()){
  if(!dialog||panel()!==dialog)return false;
  const closeButton=[...dialog.querySelectorAll('button')].find(node=>enabled(node)&&(
   node.matches('.game-fullscreen-close,[data-close],[data-casino-close],[data-funhouse-close],[data-weapons-close],[data-utility-close]')||/^close(?:\b|$)/i.test(labelled(node))));
  if(closeButton){closeButton.click();notify(dialog,closeButton,'close');return true;}
  const EventClass=document.defaultView.Event,event=new EventClass('cancel',{cancelable:true});
  if(dialog.dispatchEvent(event)&&dialog.localName==='dialog'&&dialog.open)dialog.close();
  notify(dialog,dialog,'close');return dialog.localName==='dialog'?!dialog.open:!visible(dialog);
 }
 function snapshot(){
  const dialog=panel();
  if(!dialog)return {active:false,title:'',status:'',items:[],truncated:false,signature:'',close:()=>false};
  const title=short(dialog.getAttribute('aria-label')||dialog.querySelector('h1,h2,h3')?.textContent||'Game controls');
  const status=[...dialog.querySelectorAll('[role="status"],[aria-live]')].filter(visible).map(node=>compact(node.textContent)).filter(Boolean).join(' · ').slice(0,360);
  const items=[],controls=[...dialog.querySelectorAll(controlSelector)],seen=new WeakMap();
  function add(node,label,kind,action,valid=()=>true){
   if(!label)return;
   // One DOM node can deliberately supply several select/number actions.
   const key=kind+'\n'+label,keys=seen.get(node)||new Set();if(keys.has(key))return;keys.add(key);seen.set(node,keys);
   if(!controlIds.has(node))controlIds.set(node,++nextControlId);
   items.push({id:'xr-panel:'+controlIds.get(node)+':'+kind,label:short(label),keepOpen:true,run:()=>{if(!usable(dialog,node)||!valid())return false;const result=action();notify(dialog,node,kind);return result;}});
  }
  for(const node of controls){
   if(!enabled(node)||node.closest(ignoredSelector))continue;
   const type=String(node.type||'').toLowerCase(),tag=node.localName;
   if(tag==='select'){
    const name=safeLabel(node);if(!name)continue;
    for(const option of node.options){
     if(option.disabled||option.closest('optgroup')?.disabled||option.hidden)continue;
     const text=compact(option.label||option.textContent);if(!text)continue;
     const expectedValue=option.value;
     add(node,(option.selected?'✓ ':'')+name+': '+text,'select:'+option.value,()=>{
      if(option.disabled||option.closest('optgroup')?.disabled||!node.contains(option))return false;
      if(node.value===option.value)return true;node.value=option.value;
      node.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
      node.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));return true;
     },()=>option.value===expectedValue&&compact(option.label||option.textContent)===text);
    }
   }else if(tag==='input'&&['number','range'].includes(type)){
    const name=safeLabel(node);if(!name||node.readOnly)continue;
    const value=node.valueAsNumber,minimum=node.min===''?(type==='range'?0:-Infinity):Number(node.min),maximum=node.max===''?(type==='range'?100:Infinity):Number(node.max);
    for(const direction of [-1,1]){
     if(Number.isFinite(value)&&(direction<0&&value<=minimum||direction>0&&value>=maximum))continue;
     add(node,(direction<0?'Decrease ':'Increase ')+name+' · '+node.value,'number:'+direction,()=>{
      const old=node.value;
      try{if(node.step==='any'){const step=type==='range'?Math.max(.01,(maximum-minimum)/100):1,current=Number.isFinite(node.valueAsNumber)?node.valueAsNumber:0;node.value=String(Math.max(minimum,Math.min(maximum,Math.round((current+direction*step)*1e6)/1e6)));}else if(direction<0)node.stepDown();else node.stepUp();}
      catch{return false;}
      if(node.value===old)return true;
      node.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
      node.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));return true;
     });
    }
   }else if(tag==='input'&&['checkbox','radio'].includes(type)){
    const name=labelled(node);if(!name)continue;
    const expectedChecked=node.checked;
    add(node,(node.checked?'✓ ':'')+name,'toggle',()=>{node.click();return true;},()=>type==='radio'||node.checked===expectedChecked);
   }else if(tag==='summary'){
    const name=labelled(node);if(!name||node.parentElement?.localName!=='details')continue;
    add(node,(node.parentElement.open?'Collapse ':'Open ')+name,'details',()=>{node.click();return true;});
   }else{
    const name=labelled(node);if(!name)continue;
    const pressed=node.getAttribute('aria-pressed'),selected=node.getAttribute('aria-selected'),marked=pressed==='true'||selected==='true';
    // A real click preserves native validation, authentication, purchase
    // confirmation and game-specific click listeners already on this control.
    add(node,(marked&&!name.startsWith('✓')?'✓ ':'')+name,'button',()=>{node.click();return true;},()=>labelled(node)===name&&node.getAttribute('aria-pressed')===pressed&&node.getAttribute('aria-selected')===selected);
   }
  }
  if(typeof navigate==='function')for(const link of dialog.querySelectorAll('a[href]')){
   if(!enabled(link)||link.hasAttribute('download')||link.target==='_blank'||link.closest(ignoredSelector))continue;
   let url;try{url=new URL(link.href,document.location.href);}catch{continue;}
   if(!['http:','https:'].includes(url.protocol)||url.origin!==document.location.origin)continue;
   add(link,'Open '+labelled(link),'navigate',()=>navigate(url.href));
  }
  const limit=Number.isFinite(maxActions)?Math.max(1,Math.floor(maxActions)):Infinity,truncated=items.length>limit,visibleItems=items.slice(0,limit);
  return {active:true,title,status,items:visibleItems,truncated,signature:JSON.stringify([title,status,visibleItems.map(item=>item.label),truncated]),close:()=>close(dialog)};
 }
 return {snapshot,close};
}

export function getXRPanelActions(root=globalThis.document,options={}){return xrPanelActions({...options,root}).snapshot();}
