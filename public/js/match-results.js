const columns=[['username','Player'],['score','Score'],['shots','Shots'],['hits','Hits'],['misses','Misses'],['accuracy','Accuracy'],['kills','Total kills'],['enemyKills','Enemy kills'],['playerKills','Player kills'],['assists','Assists'],['deaths','Deaths'],['hitsTaken','Hits taken'],['damageDealt','Damage dealt'],['damageTaken','Damage taken'],['items','Items collected']];
export function roundCountdown(snapshot,elapsedMs=0){const transition=snapshot?.radTox?.transition;if(!transition)return null;return {kind:transition.kind,seconds:Math.max(0,Math.ceil((transition.at-snapshot.serverTime-elapsedMs)/1000))};}
export function mountMatchResults({dock,onOpen=()=>{},onNext,onRespawn}){
 const dialog=document.createElement('dialog');dialog.className='rad-match-results';dialog.setAttribute('aria-labelledby','rad-match-results-title');
 dialog.innerHTML='<header><div><p>RAD-TOX · Shared match</p><h2 id="rad-match-results-title">Level results</h2></div><button type="button" data-results-close aria-label="Close results">Close ×</button></header><p data-results-summary></p><p class="rad-results-rules">Full health lasts 45 damaging hits. Spawn protection and shields block damage. Enemy kill: 10 points · player kill: 25 · assist: 5. Utility actions are excluded from shot accuracy.</p><div class="rad-results-scroll" tabindex="0" aria-label="Player results; scroll horizontally for all statistics"><table><caption>Individual results for every participant, including disconnected players</caption><thead><tr></tr></thead><tbody></tbody></table></div><p data-results-error role="status"></p><footer><button type="button" data-results-respawn hidden>Respawn · 45 hits</button><button type="button" data-results-next hidden>Start next level together</button></footer>';
 const head=dialog.querySelector('thead tr');for(const [,label]of columns){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}
 document.body.append(dialog);
 const button=document.createElement('button');button.type='button';button.className='house-bottom-control';button.title='Match results';button.setAttribute('aria-label','Match results');button.innerHTML='<b aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8"/></svg></b><span>Match results</span>';button.hidden=true;dock.append(button);
 let currentSnapshot=null,latest=null,selfId=null,openedEnd=null,openedDeath=null,pending=false,renderKey='',receivedAt=0,openedWave=null;
 const next=dialog.querySelector('[data-results-next]'),respawn=dialog.querySelector('[data-results-respawn]'),error=dialog.querySelector('[data-results-error]');
 function countdown(){const remaining=roundCountdown(currentSnapshot,Date.now()-receivedAt);if(!remaining)return;next.hidden=false;next.disabled=true;next.textContent=remaining.seconds?`${remaining.kind==='wave'?'Next wave':remaining.kind==='retry'?'Level retry':'Next level'} in ${remaining.seconds}s`:'Starting together…';}
 const countdownTimer=setInterval(countdown,250);countdownTimer.unref?.();
 function open(){onOpen();if(!dialog.open){(document.fullscreenElement||document.body).append(dialog);dialog.showModal();}}
 button.addEventListener('click',()=>{open();if(currentSnapshot)api.render(currentSnapshot,selfId);});dialog.querySelector('[data-results-close]').addEventListener('click',()=>dialog.close());
 async function act(action){if(pending||!latest)return;pending=true;next.disabled=respawn.disabled=true;error.textContent='';try{await action();if(dialog.open)dialog.close();}catch(failure){error.textContent=failure.message||'Unable to continue. Try again.';}finally{pending=false;next.disabled=respawn.disabled=false;}}
 next.addEventListener('click',()=>act(()=>onNext(latest.id)));respawn.addEventListener('click',()=>act(onRespawn));
 const api={reset(){currentSnapshot=null;latest=null;selfId=null;openedEnd=openedDeath=openedWave=null;renderKey='';if(dialog.open)dialog.close();button.hidden=true;},render(snapshot,id){
  currentSnapshot=snapshot;receivedAt=Date.now();selfId=id;latest=snapshot.match;button.hidden=!latest;if(!latest)return;
  const self=snapshot.players[id],finished=latest.state==='finished',wave=snapshot.radTox?.transition?.kind==='wave',waveKey=latest.id+':'+snapshot.radTox?.wave;
  if(!wave&&openedWave){openedWave=null;if(dialog.open)dialog.close();}
  if(!finished&&openedEnd&&openedEnd!==latest.id){openedEnd=null;if(dialog.open)dialog.close();}
  const deathToken=latest.id+':'+(self?.combat?.deaths||0);
  const needsOpening=(wave&&openedWave!==waveKey)||(finished&&openedEnd!==latest.id)||(!finished&&self?.health<=0&&openedDeath!==deathToken);
  if(!dialog.open&&!needsOpening)return;
  const rows=wave?snapshot.radTox.transition.results:latest.results;
  const key=JSON.stringify([latest.id,latest.state,waveKey,wave,rows]);
  if(key!==renderKey){renderKey=key;dialog.querySelector('h2').textContent=finished?`Level ${latest.level} · ${latest.outcome==='victory'?'Victory':'Team defeated'}`:`Level ${latest.level} · Live standings`;
   dialog.querySelector('[data-results-summary]').textContent=finished?`Final results · ${Math.max(0,Math.round((latest.endedAt-latest.startedAt)/1000))} seconds · ${latest.results.length} players`:'Everyone shares the same enemies and wave progress. Results are final when this level ends.';
   const body=dialog.querySelector('tbody');body.replaceChildren();for(const row of rows){const tr=document.createElement('tr');if(row.id===selfId)tr.className='is-self';for(const [field]of columns){const cell=document.createElement(field==='username'?'th':'td');if(field==='username'){cell.scope='row';cell.title=row.id;}cell.textContent=field==='username'?`${row.username}${row.id===selfId?' (you)':''}${row.connected?'':' · disconnected'}`:field==='items'?(row.items?.join(', ')||'None'):field==='accuracy'?`${row.accuracy}%`:String(row[field]??0);tr.append(cell);}body.append(tr);}
  }
  next.hidden=!finished;next.textContent=latest.outcome==='victory'?'Start next level together':'Retry this level together';respawn.hidden=finished||!self||self.health>0;
  if(wave){dialog.querySelector('h2').textContent=`Wave ${snapshot.radTox.wave} complete`;dialog.querySelector('[data-results-summary]').textContent='Level totals so far · everyone continues together.';if(openedWave!==waveKey){openedWave=waveKey;open();}}
  countdown();
  if(finished&&openedEnd!==latest.id){openedEnd=latest.id;open();}
  else if(!finished&&self?.health<=0){const token=latest.id+':'+(self.combat?.deaths||0);if(openedDeath!==token){openedDeath=token;open();}}
  else if(!finished&&openedEnd&&openedEnd!==latest.id){openedEnd=null;if(dialog.open)dialog.close();}
 }};
 return api;
}

