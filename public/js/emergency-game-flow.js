const phaseOrder=['idle','warning','detonation','fallout','recovery','clearing','all-clear'];
const copyStep=(id,label,detail,status)=>({id,label,detail,status});

// Presentation only: the room owns phase deadlines, quest completion and flight.
export function emergencyGameFlow(state,{shelterArrived=false,evacuation=null}={}){
 const phase=phaseOrder.includes(state?.phase)?state.phase:'idle',phaseIndex=phaseOrder.indexOf(phase),repeat=Number(state?.cycle)>0;
 const hasAircraft=Array.isArray(evacuation?.aircraft)&&evacuation.aircraft.length>0;
 const objectives=Array.isArray(state?.objectives)?state.objectives:[];
 const completed=id=>objectives.some(objective=>objective.id===id&&objective.completed===true);
 const titles={idle:'Explore while standing by',warning:hasAircraft?'Choose shelter or an emergency flight':'Reach shelter before the impacts',detonation:'Stay under cover through the impacts',fallout:'Recover emergency supplies',recovery:'Restore community communications',clearing:'Wait for the all-clear', 'all-clear':'Response complete'};
 const descriptions={
  idle:repeat?'The next warning follows a 3–20-minute quiet break after all-clear. Keep exploring.':'The first explosions arrive 1–3 minutes after entry, with an 18-second warning beforehand. Keep exploring.',
  warning:hasAircraft?'Shelter arrival is automatic. Emergency aircraft are an optional flight path; all movement remains available.':'Shelter arrival is automatic. Keep your radio on; all movement remains available.',
  detonation:'All three impacts and their warning sounds run automatically. Fallout begins as the final shockwaves finish.',
  fallout:'Reach the supply cache when ready. Fallout continues until the supplies are recovered.',
  recovery:'Reach the recovery relay to restore communications and complete the ground response.',
  clearing:'The response fades for eight seconds. Movement and flight stay available.',
  'all-clear':'Normal conditions have returned. The next warning follows a 3–20-minute quiet break.'
 };
 const steps=[
  copyStep('standby','Explore and prepare',repeat?'Explore during the quiet break.':hasAircraft?'Find shelter or choose a cockpit before the first warning.':'Find the shelter and listen for the first warning.',phase==='idle'?'current':'complete'),
  copyStep('shelter','Shelter · optional',shelterArrived?'Your shelter arrival is confirmed.':'Enter the marked shelter; another player’s check-in does not confirm your arrival.',shelterArrived?'complete':'optional'),
  copyStep('impacts','Warning and explosions','Stay under cover through the full warning, three impacts and fallout transition.',phaseIndex>=3?'complete':phase==='warning'||phase==='detonation'?'current':'pending'),
  copyStep('supplies','Recover relief supplies',completed('supplies')?'The shared supply objective is confirmed.':'Reach the supply cache after fallout begins; arrival collects the supplies automatically.',completed('supplies')?'complete':phase==='fallout'?'current':'pending'),
  copyStep('recovery','Restore the relay',completed('recovery')?'The shared recovery relay is restored.':'Reach the recovery relay after collecting supplies. Arrival restores communications automatically.',completed('recovery')?'complete':phase==='recovery'?'current':'pending'),
  copyStep('all-clear','Return to normal conditions','Warning effects fade for eight seconds, then the quiet interval begins.',phase==='all-clear'?'complete':phase==='clearing'?'current':'pending')
 ];
 if(hasAircraft){
  const progress=state?.id&&evacuation.progress?.eventId===state.id?evacuation.progress:null;
  const done=progress?.status==='complete',active=progress?.status==='active'&&['preflight','depart'].includes(progress.stage);
  const detail=done?'Your evacuation flight reached a safe airborne climb. Ground quests remain separate.':active?(progress.stage==='preflight'?(evacuation.canAssist===false?'Cockpit confirmed. Use manual flight controls and a clear departure area.':'Cockpit confirmed. Start emergency departure or use manual flight controls.'):'Continue the departure to a safe airborne climb. Manual control stays available.'):'Board an available emergency cockpit and reach a safe airborne climb. This does not replace the supply and relay objectives.';
  steps.splice(3,0,copyStep('evacuation','Emergency flight · optional',detail,done?'complete':active?'current':'optional'));
 }
 return {title:titles[phase],description:descriptions[phase],steps};
}
