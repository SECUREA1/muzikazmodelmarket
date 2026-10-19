const columns=[['username','Player'],['score','Level score'],['shots','Shots'],['hits','Hits'],['misses','Misses'],['accuracy','Accuracy'],['kills','Total kills'],['enemyKills','Enemy kills'],['playerKills','Player kills'],['assists','Assists'],['deaths','Deaths'],['hitsTaken','Hits taken'],['damageDealt','Damage dealt'],['damageTaken','Damage taken'],['items','Items collected']];
const tournamentColumns=[['rank','Rank'],['username','Player'],['score','Tournament total'],['kills','Total kills'],['bossKills','Boss kills'],['shots','Shots'],['hits','Hits'],['misses','Misses'],['accuracy','Accuracy'],['assists','Assists'],['deaths','Deaths'],['damageDealt','Damage dealt']];
const nonnegative=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const clock=seconds=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;

export function roundCountdown(snapshot,elapsedMs=0){
 const transition=snapshot?.radTox?.transition;
 if(!transition||!Number.isFinite(transition.at)||!Number.isFinite(snapshot.serverTime))return null;
 return {kind:transition.kind,seconds:Math.max(0,Math.ceil((transition.at-snapshot.serverTime-nonnegative(elapsedMs))/1000))};
}

/** Advance the displayed wave clock locally between authoritative snapshots. */
export function waveCountdown(snapshot,elapsedMs=0){
 const campaign=snapshot?.radTox;
 if(!campaign||campaign.transition||campaign.state!=='active'||campaign.phaseKind==='boss'||campaign.wave>4||!Number.isFinite(campaign.endsAt)||!Number.isFinite(snapshot.serverTime))return null;
 const seconds=Math.max(0,Math.ceil((campaign.endsAt-snapshot.serverTime-nonnegative(elapsedMs))/1000));
 return {wave:Math.max(1,Number(campaign.wave)||1),normalWaves:Math.max(1,Number(campaign.normalWaveCount)||4),seconds,clock:clock(seconds)};
}

/** Copy and rank cumulative server totals; level stats remain a separate table. */
export function tournamentStandings(snapshot){
 return (Array.isArray(snapshot?.tournament?.results)?snapshot.tournament.results:[]).filter(row=>row&&typeof row.id==='string').map(row=>{
  const shots=nonnegative(row.shots),hits=nonnegative(row.hits);
  return {...row,score:nonnegative(row.score),kills:Number.isFinite(row.kills)?nonnegative(row.kills):nonnegative(row.enemyKills)+nonnegative(row.playerKills),shots,hits,accuracy:Number.isFinite(row.accuracy)?Math.min(100,nonnegative(row.accuracy)):shots?Number(Math.min(100,hits/shots*100).toFixed(1)):0};
 }).sort((a,b)=>b.score-a.score||b.kills-a.kills||a.id.localeCompare(b.id)).map((row,index)=>({...row,rank:index+1}));
}

export function radToxPhaseStatus(snapshot,elapsedMs=0){
 const campaign=snapshot?.radTox;if(!campaign)return '';
 const transition=roundCountdown(snapshot,elapsedMs);
 if(transition){
  const upcoming=transition.kind==='wave'?(campaign.wave===4?'Boss battle':'Next wave'):transition.kind==='retry'?'Level retry':'Next level';
  return transition.seconds?`${upcoming} in ${transition.seconds}s · starts together`:'Waiting for the server to start the next phase…';
 }
 if(campaign.state==='finished')return 'Level complete';
 if(campaign.phaseKind==='boss'||campaign.wave>4)return 'Boss battle · defeat your boss to complete the level';
 const remaining=waveCountdown(snapshot,elapsedMs);
 return remaining?`Wave ${remaining.wave} / ${remaining.normalWaves} · ${remaining.clock} remaining${remaining.seconds?'':' · waiting for the server'}`:'';
}

export function mountMatchResults({dock,onOpen=()=>{},onNext,onRespawn}){
 const dialog=document.createElement('dialog');dialog.className='rad-match-results';dialog.setAttribute('aria-labelledby','rad-match-results-title');
 dialog.innerHTML='<header><div><p>RAD-TOX · Shared tournament</p><h2 id="rad-match-results-title">Level results</h2></div><button type="button" data-results-close aria-label="Close results">Close ×</button></header><p data-results-summary></p><p data-results-phase></p><p class="rad-results-rules">Each player fights their own local enemies. The server keeps everyone on the same level and wave clock: four 2-minute waves, then a boss. Full health lasts 45 damaging hits. Enemy kill: 10 points, plus consecutive enemy-hit streak points. Utility actions are excluded from shot accuracy.</p><section data-results-tournament hidden><h3>Tournament standings</h3><div class="rad-results-scroll" tabindex="0" aria-label="Tournament standings; scroll horizontally for all statistics"><table><caption>Cumulative totals across levels and maps, including disconnected participants</caption><thead><tr data-tournament-head></tr></thead><tbody data-tournament-body></tbody></table></div></section><h3>Current level statistics</h3><div class="rad-results-scroll" tabindex="0" aria-label="Level results; scroll horizontally for all statistics"><table><caption>Level score and combat statistics for every participant</caption><thead><tr data-level-head></tr></thead><tbody data-level-body></tbody></table></div><p data-results-error role="status"></p><footer><button type="button" data-results-respawn hidden>Respawn · 45 hits</button><button type="button" data-results-next hidden>Start next level together</button></footer>';
 function addHead(selector,fields){const head=dialog.querySelector(selector);for(const [,label]of fields){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}}
 addHead('[data-level-head]',columns);addHead('[data-tournament-head]',tournamentColumns);
 document.body.append(dialog);
 const button=document.createElement('button');button.type='button';button.className='house-bottom-control';button.title='Match results';button.setAttribute('aria-label','Match results');button.innerHTML='<b aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8"/></svg></b><span>Match results</span>';button.hidden=true;dock.append(button);
 let currentSnapshot=null,latest=null,selfId=null,openedEnd=null,openedDeath=null,pending=false,renderKey='',receivedAt=0,openedWave=null;
 const next=dialog.querySelector('[data-results-next]'),respawn=dialog.querySelector('[data-results-respawn]'),error=dialog.querySelector('[data-results-error]');
 function countdown(){
  if(!currentSnapshot)return;
  const elapsed=Date.now()-receivedAt,status=radToxPhaseStatus(currentSnapshot,elapsed),phase=dialog.querySelector('[data-results-phase]');
  if(phase.textContent!==status)phase.textContent=status;
  button.title=status?`Match results · ${status}`:'Match results';
  const remaining=roundCountdown(currentSnapshot,elapsed);if(!remaining)return;
  next.hidden=false;next.disabled=true;
  const label=remaining.kind==='wave'?(currentSnapshot.radTox.wave===4?'Boss battle':'Next wave'):remaining.kind==='retry'?'Level retry':'Next level';
  next.textContent=remaining.seconds?`${label} in ${remaining.seconds}s`:'Starting together…';
 }
 const countdownTimer=setInterval(countdown,250);countdownTimer.unref?.();
 function open(){onOpen();if(!dialog.open){(document.fullscreenElement||document.body).append(dialog);dialog.showModal();}}
 button.addEventListener('click',()=>{open();if(currentSnapshot)api.render(currentSnapshot,selfId);});dialog.querySelector('[data-results-close]').addEventListener('click',()=>dialog.close());
 async function act(action){if(pending||!latest)return;pending=true;next.disabled=respawn.disabled=true;error.textContent='';try{await action();if(dialog.open)dialog.close();}catch(failure){error.textContent=failure.message||'Unable to continue. Try again.';}finally{pending=false;next.disabled=respawn.disabled=false;}}
 next.addEventListener('click',()=>act(()=>onNext(latest.id)));respawn.addEventListener('click',()=>act(onRespawn));
 function renderRows(selector,rows,fields){
  const body=dialog.querySelector(selector);body.replaceChildren();
  for(const row of rows){
   const tr=document.createElement('tr');if(row.id===selfId)tr.className='is-self';
   for(const [field]of fields){
    const cell=document.createElement(field==='username'?'th':'td');if(field==='username'){cell.scope='row';cell.title=row.id;}
    cell.textContent=field==='username'?`${row.username||'Player'}${row.id===selfId?' (you)':''}${row.connected?'':' · disconnected'}`:field==='items'?(Array.isArray(row.items)&&row.items.length?row.items.join(', '):'None'):field==='accuracy'?`${row.accuracy??0}%`:field==='damageDealt'||field==='damageTaken'?String(Number(nonnegative(row[field]).toFixed(2))):String(row[field]??0);
    tr.append(cell);
   }
   body.append(tr);
  }
 }
 const api={
  reset(){currentSnapshot=null;latest=null;selfId=null;openedEnd=openedDeath=openedWave=null;renderKey='';if(dialog.open)dialog.close();button.hidden=true;},
  destroy(){clearInterval(countdownTimer);dialog.remove();button.remove();},
  render(snapshot,id){
   currentSnapshot=snapshot;receivedAt=Date.now();selfId=id;latest=snapshot.match;button.hidden=!latest;if(!latest)return;
   countdown();
   const self=snapshot.players?.[id],finished=latest.state==='finished',wave=snapshot.radTox?.transition?.kind==='wave',waveKey=latest.id+':'+snapshot.radTox?.wave;
   if(!wave&&openedWave){openedWave=null;if(dialog.open)dialog.close();}
   if(!finished&&openedEnd&&openedEnd!==latest.id){openedEnd=null;if(dialog.open)dialog.close();}
   const deathToken=latest.id+':'+(self?.combat?.deaths||0);
   const needsOpening=(wave&&openedWave!==waveKey)||(finished&&openedEnd!==latest.id)||(!finished&&self?.health<=0&&openedDeath!==deathToken);
   if(!dialog.open&&!needsOpening)return;
   const rows=(wave?snapshot.radTox.transition.results||latest.results:latest.results)||[],standings=tournamentStandings(snapshot);
   const key=JSON.stringify([latest.id,latest.level,latest.state,latest.outcome,waveKey,wave,rows,standings]);
   if(key!==renderKey){
    renderKey=key;dialog.querySelector('h2').textContent=finished?`Level ${latest.level} · ${latest.outcome==='victory'?'Victory':'Team defeated'}`:`Level ${latest.level} · Live standings`;
    dialog.querySelector('[data-results-summary]').textContent=finished?`Final level results · ${Math.max(0,Math.round((latest.endedAt-latest.startedAt)/1000))} seconds · ${rows.length} players`:'Your enemies and combat are local. Everyone follows the same server level and wave clock. Level score resets each level; tournament totals continue across maps.';
    renderRows('[data-level-body]',rows,columns);
    dialog.querySelector('[data-results-tournament]').hidden=!standings.length;
    renderRows('[data-tournament-body]',standings,tournamentColumns);
   }
   next.hidden=!finished;next.disabled=pending;next.textContent=latest.outcome==='victory'?'Start next level together':'Retry this level together';respawn.hidden=finished||!self||self.health>0;
   if(wave){
    dialog.querySelector('h2').textContent=`Wave ${snapshot.radTox.wave} complete`;
    dialog.querySelector('[data-results-summary]').textContent=snapshot.radTox.wave===4?'Four timed waves complete · boss battle starts together next. Level totals so far are shown below.':'Level totals so far · the next timed wave starts together.';
    if(openedWave!==waveKey){openedWave=waveKey;open();}
   }
   countdown();
   if(finished&&openedEnd!==latest.id){openedEnd=latest.id;open();}
   else if(!finished&&self?.health<=0){const token=latest.id+':'+(self.combat?.deaths||0);if(openedDeath!==token){openedDeath=token;open();}}
   else if(!finished&&openedEnd&&openedEnd!==latest.id){openedEnd=null;if(dialog.open)dialog.close();}
  }
 };
 return api;
}
