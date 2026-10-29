import {createLocalWeather} from './local-weather.js';
const preferenceKey='muzikazWeatherMirroring';
const names={clear:'Clear skies',overcast:'Cloudy',rain:'Rain',fog:'Fog',sleet:'Sleet',snow:'Snow',storm:'Thunderstorms'};
const errors={
 permission_denied:'Location is blocked. Allow location for this site in your browser or phone settings, then try again.',
 insecure:'Open the secure HTTPS version of this site to allow device location.',
 location_unavailable:'Your device could not find its location. Turn on location services, then try again.',
 location_timeout:'Getting your location took too long. Check location services and try again.',
 weather_unavailable:'Your local weather could not be checked. Check your connection and try again.'
};

export function mountWeatherMirroring({parent,onWeather=()=>{},serviceOptions={},permissions=globalThis.navigator?.permissions,storage}={}){
 // Keep only the opt-in choice. Device coordinates are never saved.
 const saved={get(){try{return (storage||globalThis.localStorage)?.getItem(preferenceKey)==='true';}catch{return false;}},set(value){try{(storage||globalThis.localStorage)?.setItem(preferenceKey,String(value));}catch{}}};
 const root=document.createElement('section');root.className='weather-mirroring';root.setAttribute('aria-label','Local weather mirroring');
 const title=document.createElement('h3');title.textContent='Mirror my local weather';
 const description=document.createElement('p');description.textContent='Use this phone or computer’s location to match outdoor maps to the weather around you. Updates every 10 minutes. Approximate location is shared with Open-Meteo to check the weather.';
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const allow=document.createElement('button');allow.type='button';allow.textContent='Allow weather mirroring';
 const stop=document.createElement('button');stop.type='button';stop.textContent='Stop weather mirroring';stop.hidden=true;
 root.append(title,description,status,allow,stop);parent.append(root);
 let disposed=false,touched=false;
 function render(state){
  if(disposed)return;
  onWeather(state.weather);root.dataset.weatherStatus=state.status;
  const busy=state.status==='locating'||state.status==='checking';
  allow.disabled=busy;allow.textContent=state.status==='synced'?'Refresh local weather':state.status==='unavailable'?'Try weather mirroring again':'Allow weather mirroring';
  root.setAttribute('aria-busy',String(busy));stop.hidden=state.status==='off';
  if(state.status==='synced'){
   saved.set(true);
   const details=[names[state.weather]||state.weather];
   if(state.temperature!==null)details.push(`${Math.round(state.temperature)}°C`);
   if(state.windSpeed!==null)details.push(`Wind ${Math.round(state.windSpeed)} km/h`);
   status.textContent=`Mirroring your local weather: ${details.join(' · ')}. Checked ${new Date(state.updatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}.`;
  }else if(state.status==='locating')status.textContent='Allow location in your device’s permission prompt. Finding your location…';
  else if(state.status==='checking')status.textContent='Location received. Checking your local weather…';
  else if(state.status==='unavailable'){
   if(state.reason==='permission_denied')saved.set(false);
   status.textContent=`${errors[state.reason]||errors.weather_unavailable} Changing game weather is active until mirroring connects.`;
  }else status.textContent='Changing game weather is active. Tap Allow weather mirroring, then allow location on this device.';
 }
 const service=createLocalWeather({...serviceOptions,onChange:render});render(service.state);
 allow.addEventListener('click',()=>{touched=true;service.refresh();});
 stop.addEventListener('click',()=>{touched=true;saved.set(false);service.stop();});
 // Restore only an already-granted permission; never open a prompt on page load.
 if(saved.get()&&permissions?.query)Promise.resolve().then(()=>permissions.query({name:'geolocation'})).then(permission=>{
  if(!disposed&&!touched&&permission.state==='granted')service.start();
 }).catch(()=>{});
 const visible=()=>{const state=service.state;if(document.visibilityState==='visible'&&service.enabled&&state.status==='synced'&&Date.now()-state.updatedAt>=600000)service.refresh();};
 document.addEventListener('visibilitychange',visible);
 return {service,root,dispose(){disposed=true;document.removeEventListener('visibilitychange',visible);service.dispose();root.remove();}};
}
