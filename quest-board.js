(function(){
  const A=Voice3Audio,$=s=>document.querySelector(s);
  const defaults=[['record','Record a five-second vocal','voice-recorded',1,25,'Quest Rewards'],['crop','Save a cropped recording','voice-cropped',1,30,'Vocals'],['upload','Upload an original sound','audio-uploaded',1,20,'Uploaded Audio'],['clips3','Use three different sound categories','clip-added',3,50,'Beats'],['bass','Add a bass clip','bass-added',1,25,'Bass'],['timing','Adjust clip timing','clip-moved',1,20],['trim','Trim or split a clip','clip-trimmed',1,20],['fade','Use an audio effect or fade','effect-applied',1,25],['save','Save a mixer session','mix-saved',1,35],['export','Export a completed mix','mix-exported',1,75,'Musical Stem'],['mint','Mint an eligible audio NFT','audio-nft-minted',1,100,'NFT Audio']];
  const dailyDrop={points:40,tokens:2};
  const dailyTiers=[{points:100,label:'Starter Drop',reward:'+1 bonus token'},{points:250,label:'Builder Drop',reward:'+3 bonus tokens'},{points:500,label:'Legend Drop',reward:'+5 bonus tokens'}];
  let quests=JSON.parse(localStorage.getItem('voice3.quests')||'null')||defaults.map(([id,title,eventType,goal,reward,soundCategory])=>({id,title,description:title,category:id==='bass'?'Bass':id==='upload'?'Upload':id==='record'?'Mic':'Mixer',eventType,goal,pointReward:reward,mixerTokenReward:Math.max(1,Math.ceil(reward/25)),reward,soundCategory,claimFrequency:'daily',active:true,reset:'daily'}));
  function period(){return new Date().toISOString().slice(0,10)}
  function progress(){return JSON.parse(localStorage.getItem('voice3.questProgress')||'{}')}
  function claims(){return JSON.parse(localStorage.getItem('voice3.questClaims')||'{}')}
  function dailyState(){return JSON.parse(localStorage.getItem(`voice3.dailyRewards.${A.wallet()}`)||'{}')}
  function saveP(p){localStorage.setItem('voice3.questProgress',JSON.stringify(p))}
  function saveC(c){localStorage.setItem('voice3.questClaims',JSON.stringify(c))}
  function saveDaily(d){localStorage.setItem(`voice3.dailyRewards.${A.wallet()}`,JSON.stringify(d))}
  function saveQ(){localStorage.setItem('voice3.quests',JSON.stringify(quests))}
  function key(q){return`${A.wallet()}:${q.id}:${period()}`}
  function yesterday(){const d=new Date();d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
  async function render(){
    const p=progress(),c=claims(),bal=await A.balance(),pts=await A.points(),ledger=await A.ledger(),d=dailyState(),today=period(),dailyClaimed=d.lastClaim===today;
    const walletLedger=ledger.filter(x=>x.walletId===A.wallet());
    $('#wallet-readout').textContent=A.wallet();
    $('#reward-summary').value=`${pts} points · ${bal} MZK · earned today ${walletLedger.filter(x=>x.amount>0&&x.createdAt.startsWith(today)).reduce((a,x)=>a+x.amount,0)} · pending ${quests.reduce((a,q)=>a+(((p[key(q)]||0)>=q.goal&&!c[key(q)])?(q.mixerTokenReward||q.reward):0),0)}`;
    $('#daily-streak').textContent=`${d.streak||0} day streak`;
    $('#daily-drop').textContent=`+${dailyDrop.points} pts · +${dailyDrop.tokens} MZK`;
    $('#daily-status').textContent=dailyClaimed?'Claimed for today — come back after the next reset.':'Available now — claim your daily points.';
    $('#claim-daily-reward').disabled=dailyClaimed;
    $('#claim-daily-reward').textContent=dailyClaimed?'Daily points claimed':`Claim ${dailyDrop.points} points`;
    $('#daily-tiers').innerHTML=dailyTiers.map(t=>`<article class="daily-tier ${pts>=t.points?'unlocked':''}"><strong>${t.label}</strong><span>${t.points} pts needed</span><small>${pts>=t.points?'Unlocked daily tier':`${Math.max(0,t.points-pts)} pts to go`} · ${t.reward}</small></article>`).join('');
    $('#quests').innerHTML=quests.map(q=>{const k=key(q),v=p[k]||0,done=v>=q.goal,claimed=!!c[k];return`<article class="quest-card ${done?'done':''}"><h3>${q.title}</h3><p>${q.category} · listens for <code>${q.eventType}</code></p><progress max="${q.goal}" value="${Math.min(v,q.goal)}"></progress><strong>${Math.min(v,q.goal)} / ${q.goal} · ${q.pointReward||q.reward} pts · ${q.mixerTokenReward||q.reward} MZK${q.soundCategory?' · unlocks '+q.soundCategory:''}</strong><button data-claim="${q.id}" ${!done||claimed?'disabled':''}>${claimed?'Claimed':'Claim reward'}</button></article>`}).join('');
    $('#ledger').innerHTML=walletLedger.slice(-12).reverse().map(x=>`<p><span>${x.reason}</span><b>${x.amount}</b></p>`).join('')||'<p>No token transactions yet.</p>';
    $('#quest-form').hidden=localStorage.getItem('voice3.admin.dev')!=='true';
  }
  async function ingest(ev){const p=progress(); quests.filter(q=>q.eventType===ev.type).forEach(q=>{p[key(q)]=(p[key(q)]||0)+1}); saveP(p); render()}
  ['voice-recorded','voice-cropped','audio-uploaded','clip-added','clip-moved','clip-trimmed','bass-added','effect-applied','mix-saved','mix-exported','audio-nft-minted'].forEach(t=>window.addEventListener(`voice3:${t}`,e=>ingest(e.detail)));
  async function replay(){(await A.all(A.QUEST)).filter(e=>e.walletId===A.wallet()).forEach(e=>ingest(e))}
  $('#claim-daily-reward').onclick=async()=>{const d=dailyState(),today=period(); if(d.lastClaim===today)return; const streak=d.lastClaim===yesterday()?(d.streak||0)+1:1; await A.addTokens(dailyDrop.tokens,'Daily point reward','daily-reward',{points:dailyDrop.points,id:`daily:${A.wallet()}:${today}`}); saveDaily({...d,lastClaim:today,streak}); render()};
  $('#quests').onclick=async e=>{const id=e.target.dataset.claim;if(!id)return;const q=quests.find(x=>x.id===id),c=claims(),k=key(q); if(c[k])return; c[k]=new Date().toISOString(); saveC(c); const sound=await A.itemFromBlob(A.makeToneBlob(120+Math.random()*440,1.5,'sine'),{displayName:q.title+' reward sound',sourceType:'quest',category:q.soundCategory||'Quest Rewards',questId:q.id}); await A.addTokens(q.mixerTokenReward||q.reward,`Quest claimed: ${q.title}`,q.id,{points:q.pointReward||q.reward,soundTokenId:sound.id,id:`claim:${A.wallet()}:${q.id}:${period()}`}); alert(`Reward claimed — ${q.mixerTokenReward||q.reward} MZK and sound unlocked.`); render()};
  $('#export-quests').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(quests,null,2)],{type:'application/json'}));a.download='voice3-quests.json';a.click();URL.revokeObjectURL(a.href)};
  $('#import-quests').onchange=async e=>{const text=await e.target.files[0].text(); const parsed=JSON.parse(text); if(Array.isArray(parsed)){quests=parsed.map(q=>({id:A.sanitizeName(q.id||A.uid('quest')),title:A.sanitizeName(q.title),category:A.sanitizeName(q.category||'Imported'),eventType:A.sanitizeName(q.eventType),goal:Math.max(1,Number(q.goal)||1),reward:Math.max(1,Number(q.reward)||1),pointReward:Math.max(1,Number(q.pointReward||q.reward)||1),mixerTokenReward:Math.max(1,Number(q.mixerTokenReward||q.reward)||1),reset:q.reset==='weekly'?'weekly':'daily'})); saveQ(); render()}};
  $('#toggle-admin').onclick=()=>{localStorage.setItem('voice3.admin.dev',localStorage.getItem('voice3.admin.dev')==='true'?'false':'true');render()};
  $('#quest-form').onsubmit=e=>{e.preventDefault(); const f=new FormData(e.target); const reward=+f.get('reward'); quests.push({id:A.uid('quest'),title:A.sanitizeName(f.get('title')),category:'Custom',eventType:A.sanitizeName(f.get('eventType')),goal:+f.get('goal'),reward,pointReward:reward,mixerTokenReward:Math.max(1,Math.ceil(reward/25)),reset:'daily'}); saveQ(); render(); e.target.reset()};
  $('#reset-claims').onclick=()=>{localStorage.removeItem('voice3.questClaims');localStorage.removeItem(`voice3.dailyRewards.${A.wallet()}`);render()};
  A.openDb().then(()=>{A.renderRewardsBar('#shared-rewards'); replay().then(render)});
})();
