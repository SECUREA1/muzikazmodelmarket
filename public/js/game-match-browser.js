import {SharedGameInventory} from './shared-game-inventory.js';

const POLL_MS = 5000;
const MAX_VISIBLE_MATCHES = 40;
const waiting = match => match.status === 'waiting' || match.status === 'available';
const labelForGame = game => ({hockey:'Hockey',basketball:'Basketball',arcade:'Arcade','firing-range':'Firing range'}[game] || 'Game');
const integer = value => Math.max(0, Math.floor(Number(value) || 0));

// Prioritize the current map and populated lobbies before empty destinations.
export function selectGameMatches(matches, {game, currentMapId, filter='waiting'}={}) {
  return (Array.isArray(matches) ? matches : [])
    .filter(match => match && typeof match.id === 'string' && (!game || match.game === game))
    .filter(match => filter === 'all' || (waiting(match) && match.canJoin && integer(match.openSlots) > 0))
    .sort((a,b) => Number(b.mapId === currentMapId) - Number(a.mapId === currentMapId)
      || Number(waiting(b)) - Number(waiting(a))
      || integer(b.players) - integer(a.players)
      || String(a.mapName || '').localeCompare(String(b.mapName || ''))
      || a.id.localeCompare(b.id));
}

export function matchBrowserVisible(root, page=document) {
  if (page.hidden || !root.isConnected) return false;
  for (let parent=root; parent; parent=parent.parentElement) {
    if (parent.hidden || parent.inert || (parent.tagName === 'DIALOG' && !parent.open)
      || (parent.tagName === 'DETAILS' && !parent.open)) return false;
  }
  return !root.getClientRects || root.getClientRects().length > 0;
}

function element(tag, className, text) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
function setText(node, text) { if(node.textContent!==text)node.textContent=text; }
function safeMatchUrl(value) {
  if(typeof value!=='string' || !value.trim())return null;
  try {
    const url=new URL(value,location.href);
    return url.origin===location.origin && ['http:','https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function mountGameMatchBrowser(root, {game, currentMapId, onJoin}={}) {
  const styleUrl=new URL('../assets/game-matches.css',import.meta.url).href;
  if(!document.querySelector('link[data-game-matches-style]')) {
    const style=document.createElement('link');style.rel='stylesheet';style.href=styleUrl;style.dataset.gameMatchesStyle='';document.head.append(style);
  }
  root.classList.add('game-match-browser');
  root.setAttribute('aria-label','Find multiplayer matches');
  const heading=element('h3','game-match-browser__title','Find a multiplayer match');
  const help=element('p','game-match-browser__help','Join an open lobby before the match starts. The match stays in the lobby until a player starts it.');
  const controls=element('div','game-match-browser__controls');
  const filterLabel=element('label',null,'Show '),filter=element('select');
  for(const [value,label] of [['waiting','Open lobbies'],['all','All matches']]){const option=element('option',null,label);option.value=value;filter.append(option);}
  filter.value='waiting';
  filterLabel.append(filter);
  const refreshButton=element('button',null,'Refresh');refreshButton.type='button';
  controls.append(filterLabel,refreshButton);
  const status=element('p','game-match-browser__status','Open this panel to find matches.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=element('div','game-match-browser__list');
  root.replaceChildren(heading,help,controls,status,list);
  const inventory=new SharedGameInventory(),cards=new Map();
  let matches=[],fetching=false,destroyed=false,loaded=false,lastLoadedAt=0,interval;
  const mapId=()=>typeof currentMapId==='function'?currentMapId():currentMapId;

  function cardFor(match) {
    let card=cards.get(match.id);
    if(!card){
      const node=element('article','game-match-card'),title=element('h4'),state=element('span','game-match-card__state');
      const top=element('div','game-match-card__heading');top.append(title,state);
      const info=element('p','game-match-card__info'),roster=element('ul','game-match-card__roster'),actions=element('div','game-match-card__actions');
      const join=element('a',null,'Join match'),watch=element('a',null,'Watch');
      actions.append(join,watch);node.append(top,info,roster,actions);
      card={node,title,state,info,roster,join,watch,signature:''};cards.set(match.id,card);
      for(const [link,spectate] of [[join,false],[watch,true]])link.addEventListener('click',event=>{
        if(!onJoin || event.defaultPrevented || event.button>0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
        event.preventDefault();
        Promise.resolve().then(()=>onJoin(card.match,{spectate,url:link.href})).catch(error=>setText(status,error.message||'Unable to open this match. Try again.'));
      });
    }
    card.match=match;
    const signature=JSON.stringify([match.mapName,match.gameName,match.game,match.status,match.players,match.capacity,match.openSlots,match.hostName,match.canJoin,match.canSpectate,match.joinUrl,match.spectateUrl,match.slots]);
    if(card.signature===signature)return card.node;
    card.signature=signature;
    setText(card.title,match.gameName?`${match.gameName} · ${match.mapName || labelForGame(match.game)}`:match.mapName || labelForGame(match.game));
    setText(card.state,waiting(match)?'Waiting for players':match.status==='playing'?'In progress':'Finished');
    card.node.dataset.state=match.status;
    setText(card.info,`${integer(match.players)} / ${integer(match.capacity)} players · ${integer(match.openSlots)} open${match.hostName ? ` · Host: ${match.hostName}` : ''}`);
    card.roster.replaceChildren();
    for(const slot of (Array.isArray(match.slots)?match.slots:[]).slice(0,16)){
      const seat=element('li',slot.occupied?'is-occupied':'is-open',`${slot.label || 'Player'}: ${slot.occupied ? slot.name || 'Joined' : 'Open'}`);card.roster.append(seat);
    }
    for(const [link,allowed,url] of [[card.join,match.canJoin&&integer(match.openSlots)>0,match.joinUrl],[card.watch,match.canSpectate,match.spectateUrl]]) {
      const href=safeMatchUrl(url);link.hidden=!allowed||!href;
      if(href && link.href!==href)link.href=href;
    }
    setText(card.join,waiting(match)?'Join lobby':'Join match');
    return card.node;
  }
  function render(){
    const selected=selectGameMatches(matches,{game,currentMapId:mapId(),filter:filter.value});
    const visible=selected.slice(0,MAX_VISIBLE_MATCHES),keep=new Set(visible.map(match=>match.id));
    for(const [id,card] of cards)if(!keep.has(id)){card.node.remove();cards.delete(id);}
    // Moving an article can blur its focused link in mobile browsers. Keep
    // existing cards in place while a player is using one of their controls.
    const preserveOrder=list.contains?.(document.activeElement);
    visible.forEach((match,index)=>{const node=cardFor(match);if(preserveOrder){if(node.parentElement!==list)list.append(node);}else if(list.children[index]!==node)list.insertBefore(node,list.children[index]||null);});
    const countLabel=filter.value==='waiting'?(selected.length===1?'open lobby':'open lobbies'):(selected.length===1?'match':'matches');
    setText(status,selected.length?`${selected.length} ${countLabel}${selected.length>MAX_VISIBLE_MATCHES?` · showing ${MAX_VISIBLE_MATCHES}`:''}`:filter.value==='waiting'?'No open lobbies yet. Choose All matches to open a game and gather players.':'No matches available yet.');
  }
  async function refresh(force=false){
    if(destroyed || fetching || !matchBrowserVisible(root) || (!force&&Date.now()-lastLoadedAt<POLL_MS))return;
    fetching=true;refreshButton.disabled=true;
    if(!loaded)setText(status,'Finding multiplayer matches…');
    try{
      const result=await inventory.api('/api/matches');
      if(destroyed)return;
      matches=Array.isArray(result?.matches)?result.matches:[];loaded=true;lastLoadedAt=Date.now();render();
    }catch(error){if(!destroyed)setText(status,loaded?'Connection interrupted. Your last match list is shown. Refresh to retry.':error.message||'Matches are unavailable. Refresh to retry.');}
    finally{fetching=false;if(!destroyed)refreshButton.disabled=false;}
  }
  const refreshOnOpen=()=>{if(matchBrowserVisible(root))refresh();};
  const refreshClick=()=>refresh(true),filterChange=()=>{render();refresh();};
  refreshButton.addEventListener('click',refreshClick);filter.addEventListener('change',filterChange);
  document.addEventListener('visibilitychange',refreshOnOpen);
  const observer=typeof MutationObserver==='function'?new MutationObserver(refreshOnOpen):null;
  for(let parent=root.parentElement;parent;parent=parent.parentElement)observer?.observe(parent,{attributes:true,attributeFilter:['open','hidden','class','style']});
  function destroy(){if(destroyed)return;destroyed=true;clearInterval(interval);observer?.disconnect();document.removeEventListener('visibilitychange',refreshOnOpen);refreshButton.removeEventListener('click',refreshClick);filter.removeEventListener('change',filterChange);cards.clear();}
  interval=setInterval(()=>{if(!root.isConnected){destroy();return;}refresh();},POLL_MS);
  refresh();
  return {refresh:()=>refresh(true),destroy};
}
