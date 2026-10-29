// Weather needs a location and forecast; the computer clock alone cannot supply it.
export function weatherType(code) {
 if (!Number.isInteger(code)) throw Error('Invalid weather code');
 if (code === 0 || code === 1) return 'clear';
 if ([2,3].includes(code)) return 'overcast';
 if ([45,48].includes(code)) return 'fog';
 if ([56,57,66,67].includes(code)) return 'sleet';
 if ([71,73,75,77,85,86].includes(code)) return 'snow';
 if ([95,96,99].includes(code)) return 'storm';
 if ([51,53,55,61,63,65,80,81,82].includes(code)) return 'rain';
 throw Error('Unknown weather code');
}

export function createLocalWeather({geolocation=globalThis.navigator?.geolocation,fetchWeather=globalThis.fetch,now=Date.now,secure=globalThis.isSecureContext??true,onChange=()=>{}}={}) {
 let enabled=false,generation=0,timer=null,controller=null,state={status:'off',weather:null};
 const emit=(status,details={})=>{state={status,weather:null,...details};onChange({...state});};
 function stop(){enabled=false;generation++;clearTimeout(timer);controller?.abort();emit('off');}
 function locate(signal){
  return new Promise((resolve,reject)=>{
   const abort=()=>reject(signal.reason||Error('Location timed out'));
   signal.addEventListener('abort',abort,{once:true});
   const finish=(callback,value)=>{signal.removeEventListener('abort',abort);callback(value);};
   geolocation.getCurrentPosition(position=>finish(resolve,position),error=>finish(reject,error),{enableHighAccuracy:false,timeout:10000,maximumAge:0});
  });
 }
 async function refresh(){
  const token=++generation;clearTimeout(timer);controller?.abort();
  const request=new AbortController();controller=request;
  let phase='location';
  let timeout=setTimeout(()=>request.abort(),60000);
  emit('locating',{weather:state.weather});
  try {
   if(!secure)throw {reason:'insecure'};
   if(!geolocation)throw {reason:'location_unavailable'};
   const position=await locate(request.signal);
   if(!enabled||token!==generation||request.signal.aborted)return;
   const {latitude,longitude}=position.coords;
   if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw {reason:'location_unavailable'};
   clearTimeout(timeout);timeout=setTimeout(()=>request.abort(),15000);
   phase='weather';emit('checking',{weather:state.weather});
   const url=new URL('https://api.open-meteo.com/v1/forecast');
   url.search=new URLSearchParams({latitude:latitude.toFixed(2),longitude:longitude.toFixed(2),current:'weather_code,temperature_2m,wind_speed_10m',timeformat:'unixtime',timezone:'auto'});
   const response=await fetchWeather(url,{signal:request.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error('Weather unavailable');
   const data=await response.json(),time=data?.current?.time*1000;
   if(typeof data?.current?.time!=='number'||!Number.isFinite(time)||Math.abs(now()-time)>1800000)throw Error('Weather is out of date');
   const weather=weatherType(data.current?.weather_code);
   if(enabled&&token===generation)emit('synced',{weather,updatedAt:time,
    temperature:Number.isFinite(data.current.temperature_2m)?data.current.temperature_2m:null,
    windSpeed:Number.isFinite(data.current.wind_speed_10m)?data.current.wind_speed_10m:null});
  } catch(error) {
   if(enabled&&token===generation)emit('unavailable',{reason:error?.reason||(phase==='weather'?'weather_unavailable':error?.code===1?'permission_denied':error?.code===3||request.signal.aborted?'location_timeout':'location_unavailable')});
  } finally {
   clearTimeout(timeout);
   // Denied or unsupported location waits for a deliberate retry.
   if(enabled&&token===generation&&(state.status==='synced'||['weather_unavailable','location_timeout'].includes(state.reason)))timer=setTimeout(refresh,600000);
  }
 }
 return {get enabled(){return enabled;},get state(){return {...state};},start(){if(enabled)return;enabled=true;void refresh();},refresh(){enabled=true;void refresh();},stop,dispose:stop};
}
