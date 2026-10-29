// Weather needs a location and forecast; the computer clock alone cannot supply it.
export function weatherType(code) {
 if (!Number.isInteger(code)) throw Error('Invalid weather code');
 if (code === 0 || code === 1) return 'clear';
 if ([2,3,45,48].includes(code)) return 'overcast';
 if ([71,73,75,77,85,86].includes(code)) return 'snow';
 if ([95,96,99].includes(code)) return 'storm';
 if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
 throw Error('Unknown weather code');
}

export function createLocalWeather({geolocation=globalThis.navigator?.geolocation,fetchWeather=globalThis.fetch,now=Date.now,onChange=()=>{}}={}) {
 let enabled=false,generation=0,timer=null,controller=null;
 function stop(){enabled=false;generation++;clearTimeout(timer);controller?.abort();onChange({status:'off',weather:null});}
 async function refresh(){
  const token=++generation;
  const request=new AbortController();controller=request;
  const timeout=setTimeout(()=>request.abort(),15000);
  try {
   const position=await new Promise((resolve,reject)=>{
    if(!geolocation) return reject(Error('Location unavailable'));
    geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:10000,maximumAge:600000});
   });
   if(!enabled||token!==generation)return;
   const {latitude,longitude}=position.coords;
   if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw Error('Invalid location');
   const url=new URL('https://api.open-meteo.com/v1/forecast');
   url.search=new URLSearchParams({latitude:latitude.toFixed(2),longitude:longitude.toFixed(2),current:'weather_code',timeformat:'unixtime',timezone:'auto'});
   const response=await fetchWeather(url,{signal:request.signal});
   if(!response.ok)throw Error('Weather unavailable');
   const data=await response.json(),time=data?.current?.time*1000;
   if(typeof data?.current?.time!=='number'||!Number.isFinite(time)||Math.abs(now()-time)>1800000)throw Error('Weather is out of date');
   const weather=weatherType(data.current?.weather_code);
   if(enabled&&token===generation)onChange({status:'synced',weather,updatedAt:time});
  } catch {
   if(enabled&&token===generation)onChange({status:'unavailable',weather:null});
  } finally {
   clearTimeout(timeout);
   if(enabled&&token===generation)timer=setTimeout(refresh,600000);
  }
 }
 return {get enabled(){return enabled;},start(){if(enabled)return;enabled=true;onChange({status:'loading',weather:null});void refresh();},stop,dispose:stop};
}
