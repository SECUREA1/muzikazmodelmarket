const TAU=Math.PI*2;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const point=value=>value&&['x','y','z'].every(axis=>Number.isFinite(value[axis]));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const offsets={warning:0,detonation:18,fallout:25,recovery:25,clearing:25};
const statuses=Object.freeze({
 idle:Object.freeze({label:'Response flights standing by',message:'Emergency aircraft are standing by.',active:false,aircraftCount:0}),
 warning:Object.freeze({label:'Command flight departing',message:'Command flight is climbing into its response circuit.',active:true,aircraftCount:1}),
 detonation:Object.freeze({label:'Command flight holding clear',message:'Command flight is holding clear of the distant impacts.',active:true,aircraftCount:1}),
 fallout:Object.freeze({label:'Relief flights circling',message:'Relief flights are circling the response area.',active:true,aircraftCount:2}),
 recovery:Object.freeze({label:'Response flights returning',message:'Response aircraft are returning on patrol.',active:true,aircraftCount:2}),
 clearing:Object.freeze({label:'Response flights clearing',message:'Response flights are leaving as conditions clear.',active:true,aircraftCount:2}),
 'all-clear':Object.freeze({label:'Response flights clear',message:'Response aircraft are clear of the area.',active:false,aircraftCount:0})
});

// UI guidance and the scene share phase facts without importing any renderer.
export function doomsdayResponseStatus(state){return statuses[state?.phase]||statuses.idle;}

/** Copy one map-owned anchor for the event. Neither its paths nor their
 * altitude follow a walking player or a piloted aircraft. */
export function createDoomsdayResponsePlan(environment={},state={}){
 const objectives=(state.objectives||[]).map(objective=>objective.position).filter(point);
 const spawn=environment.spawn?.position||environment.spawn||{};
 const center=objectives.length?objectives.reduce((sum,value)=>({x:sum.x+value.x/objectives.length,y:sum.y+value.y/objectives.length,z:sum.z+value.z/objectives.length}),{x:0,y:0,z:0}):{x:finite(spawn.x),y:finite(spawn.y),z:finite(spawn.z)};
 const candidate=environment.airport?.enabled?(environment.airport.runways?.[0]||environment.airport.runway):null;
 const runway=candidate&&Number.isFinite(candidate.x)&&Number.isFinite(candidate.z)?candidate:null;
 const anchor=Object.freeze(runway?{x:runway.x,y:finite(runway.y,finite(spawn.y,center.y)),z:runway.z}:{...center});
 const size=finite(environment.builderScene?.mapSize,finite(environment.playableSize,256));
 const radius=clamp(size*.18,32,145),airport=!!runway;
 return Object.freeze({anchor,radius,period:clamp(TAU*radius/12,40,82),airport,initialAltitude:airport?8:32,cruiseAltitude:airport?34:48});
}

function clock(state,time){
 const phase=state?.phase,offset=offsets[phase]??0;
 const presentation=[state?.presentationTime,state?.serverTime,state?.currentServerTime].find(Number.isFinite);
 const measured=Number.isFinite(presentation)&&Number.isFinite(state?.phaseStartedAt)?presentation-state.phaseStartedAt:NaN;
 const phaseElapsed=Math.max(0,finite(measured,finite(state?.phaseElapsedMs,finite(time)*1000))/1000);
 const elapsed=Number.isFinite(presentation)&&Number.isFinite(state?.startedAt)?finite((presentation-state.startedAt)/1000,offset+phaseElapsed):Number.isFinite(state?.phaseStartedAt)&&Number.isFinite(state?.startedAt)?finite((state.phaseStartedAt-state.startedAt)/1000,offset)+phaseElapsed:offset+phaseElapsed;
 const falloutAt=Number.isFinite(state?.falloutAt)&&Number.isFinite(state?.startedAt)?finite((state.falloutAt-state.startedAt)/1000,25):25;
 return {elapsed:Math.max(0,elapsed),phaseElapsed,falloutAt:Math.max(0,falloutAt)};
}

/** Deterministic, nonphysical response flights. Public aircraft and their
 * actual departure assistance remain owned by the authoritative simulation. */
export function sampleDoomsdayResponseFlight(plan,state,time=0,{reducedMotion=false}={}){
 const status=doomsdayResponseStatus(state),phase=state?.phase,{elapsed,phaseElapsed,falloutAt}=clock(state,time);
 const clearDuration=Number.isFinite(state?.phaseEndsAt)&&Number.isFinite(state?.phaseStartedAt)?Math.max(.001,(state.phaseEndsAt-state.phaseStartedAt)/1000):8;
 const clear=phase==='clearing'?clamp(phaseElapsed/clearDuration):0,opacity=status.active?1-clear:0;
 const aircraft=[0,1].map(index=>{
  const evacuation=index===1,id=evacuation?'evacuation':'command',local=Math.max(0,elapsed-(evacuation?falloutAt:0));
  const visible=status.active&&opacity>0&&(!evacuation||['fallout','recovery','clearing'].includes(phase));
  const direction=evacuation?-1:1,period=plan.period*(evacuation?1.12:1),omega=direction*TAU/period;
  const lap=Math.floor(local/period),angle=reducedMotion?(evacuation?3.8:2.55):(local%period)*omega+Math.PI;
  const departure=smooth(local/12),spread=reducedMotion?0:smooth(clear)*plan.radius*.65;
  const radiusX=plan.radius+spread,radiusZ=plan.radius*.78+spread;
  const x=Math.sin(angle)*radiusX,z=Math.cos(angle)*radiusZ;
  const climb=reducedMotion?1:departure;
  // Relief joins above the established command circuit, including throughout
  // its climb. Opposite orbits can cross in plan view without visual contact.
  const initialAltitude=evacuation?plan.cruiseAltitude+10:plan.initialAltitude,targetAltitude=plan.cruiseAltitude+(evacuation?18:0);
  const altitude=initialAltitude+(targetAltitude-initialAltitude)*climb+(reducedMotion?0:smooth(clear)*18);
  const radialSpeed=!reducedMotion&&clear>0&&clear<1?plan.radius*.65*6*clear*(1-clear)/clearDuration:0;
  const dx=radiusX*Math.cos(angle)*omega+Math.sin(angle)*radialSpeed,dz=-radiusZ*Math.sin(angle)*omega+Math.cos(angle)*radialSpeed;
  const climbSpeed=!reducedMotion&&local<12?(targetAltitude-initialAltitude)*6*clamp(local/12)*(1-clamp(local/12))/12:0;
  const pitch=reducedMotion?0:Math.atan2(climbSpeed,Math.max(1,Math.hypot(dx,dz)));
  const yaw=reducedMotion?evacuation?1.4:-1.1:Math.atan2(-dx,-dz);
  const bank=reducedMotion?0:direction*(.13+.035*Math.sin(angle*2))*smooth(local/4);
  const stage=!visible?'standby':phase==='clearing'?'returning':phase==='recovery'?'return-patrol':phase==='detonation'?'holding-clear':local<12&&!reducedMotion?'departure':evacuation?'relief-circuit':'command-circuit';
  return {id,modelId:evacuation?'doomsday-evacuation-aircraft':'doomsday-command-aircraft',visible,
   position:{x:plan.anchor.x+x,y:plan.anchor.y+altitude,z:plan.anchor.z+z},rotation:{x:pitch,y:yaw,z:bank},stage,
   lap:reducedMotion?0:lap,progress:reducedMotion?1:departure,gear:!reducedMotion&&local<8,propellerSpeed:visible&&!reducedMotion?20+12*departure:0};
 });
 return {active:status.active&&opacity>0,opacity,elapsed,phaseElapsed,aircraft};
}
