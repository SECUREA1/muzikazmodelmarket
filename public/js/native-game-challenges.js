// Native sports challenges track practice achievements. They never grant currency.
export const HOCKEY_CHALLENGES=Object.freeze([
 {id:'ice-time',title:'Find your skating rhythm',description:'Play 30 new match seconds as a skater. Watching a match does not count.',metric:'matchSeconds',goal:30,unit:'seconds'},
 {id:'team-goal',title:'Help your team score',description:'Stay in a player slot while your team scores one new goal. AI teammates can help.',metric:'teamGoals',goal:1,unit:'team goals'}
]);
export function arcadeChallenges(enabled=[]){
 const ids=new Set(enabled),offers=[];
 if([...ids].some(id=>['hockey','shooting','basketball','air-hockey','billiards'].includes(id)))offers.push({id:'arcade-round',title:'Finish an arcade round',description:'Choose an available game and finish a new round as a player. Leaving early or watching does not count.',metric:'rounds',goal:1,unit:'rounds'});
 if(ids.has('train')||ids.has('coaster'))offers.push({id:'park-lap',title:'Explore the park by ride',description:'Board an available train or coaster and stay aboard for one complete lap. Leaving early does not count.',metric:'laps',goal:1,unit:'laps'});
 return offers;
}
export function createNativeChallengeTracker(offers=[]){
 let latest=null,active=null,revision=0;
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const view=()=>active?{...active,offer:{...active.offer}}:null;
 return {
  update(snapshot){
   latest=snapshot;
   if(active?.status==='active'){
    if(snapshot.sessionId!==active.sessionId||!snapshot.playing||snapshot.spectating){active.status='cancelled';active.message='Challenge cleared after leaving, restarting or watching the game.';revision++;}
    else{active.progress=Math.min(active.offer.goal,Math.max(0,number(snapshot.metrics?.[active.offer.metric])-active.baseline));if(active.progress>=active.offer.goal){active.status='completed';active.message='Challenge complete · '+active.offer.title;revision++;}}
   }
   return view();
  },
  start(id){
   const offer=offers.find(item=>item.id===id);
   if(!offer||active?.status==='active'||!latest?.playing||latest.spectating||latest.canStart===false)return false;
   active={offer:{...offer},status:'active',progress:0,baseline:number(latest.metrics?.[offer.metric]),sessionId:latest.sessionId,message:''};revision++;return view();
  },
  cancel(){if(active?.status==='active'){active.status='cancelled';active.message='Challenge cancelled. Choose another whenever you are ready.';revision++;}return view();},
  get active(){return view();},get revision(){return revision;},get ready(){return !!latest?.playing&&!latest.spectating&&latest.canStart!==false;}
 };
}
export function mountNativeGameChallenges({parent=document.body,name='This map',offers=[],onRelease=()=>{},onReturnFocus=()=>{}}={}){
 const tracker=createNativeChallengeTracker(offers),style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../assets/native-game-challenges.css',import.meta.url).href;document.head.append(style);
 const root=document.createElement('section');root.className='native-game-challenges';root.dataset.gameplayBlocking='false';root.setAttribute('aria-label','Map challenges');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='native-challenge-toggle';toggle.textContent='Challenges';toggle.setAttribute('aria-expanded','true');
 const panel=document.createElement('section');panel.className='native-challenge-panel';panel.setAttribute('aria-label',name+' challenges');
 const heading=document.createElement('strong');heading.textContent=name+' · challenges';
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close challenges');
 const header=document.createElement('div');header.className='native-challenge-header';header.append(heading,close);
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Choose a challenge and play. Progress begins when you accept.';
 const list=document.createElement('div');list.className='native-challenge-list';const buttons=[];
 for(const offer of offers){const card=document.createElement('article'),title=document.createElement('strong'),description=document.createElement('p'),button=document.createElement('button');title.textContent=offer.title;description.textContent=offer.description;button.type='button';button.textContent='Accept challenge';button.setAttribute('aria-label','Accept '+offer.title);button.disabled=true;button.onclick=()=>{if(tracker.start(offer.id)){setOpen(false);render(true);onReturnFocus();}};card.append(title,description,button);list.append(card);buttons.push(button);}
 if(!offers.length){const empty=document.createElement('p');empty.textContent='No playable game or ride is enabled on this map.';list.append(empty);}
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel challenge';cancel.hidden=true;cancel.onclick=()=>{onRelease();tracker.cancel();render(true);onReturnFocus();};
 panel.append(header,status,list,cancel);root.append(toggle,panel);parent.append(root);
 let shownRevision=0,lastRender='';
 function setOpen(value){if(panel.hidden===!value)return;onRelease();panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));}
 function render(force=false){const active=tracker.active,signature=JSON.stringify([active,tracker.ready]);if(!force&&signature===lastRender)return;lastRender=signature;const running=active?.status==='active';for(const button of buttons)button.disabled=!tracker.ready||running;list.hidden=running;cancel.hidden=!running;status.textContent=running?active.offer.title+' · '+Math.floor(active.progress)+' / '+active.offer.goal+' '+active.offer.unit:active?.message||(tracker.ready?'Choose a challenge. Only new progress after acceptance counts.':'Start or join a game as a player to accept a challenge.');toggle.textContent=running?'Challenge · '+Math.floor(active.progress)+' / '+active.offer.goal:'Challenges';}
 toggle.onclick=()=>setOpen(panel.hidden);close.onclick=()=>{setOpen(false);onReturnFocus();};
 root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);onReturnFocus();}});
 for(const type of ['pointerdown','click','wheel'])root.addEventListener(type,event=>event.stopPropagation());
 return {root,update(snapshot){tracker.update(snapshot);if(tracker.revision!==shownRevision){shownRevision=tracker.revision;if(tracker.active?.status==='completed'||tracker.active?.status==='cancelled'){
   // A status notification does not capture focus or clear fresh movement.
   panel.hidden=false;toggle.setAttribute('aria-expanded','true');
  }}render();},dispose(){root.remove();style.remove();},snapshot:()=>tracker.active};
}
