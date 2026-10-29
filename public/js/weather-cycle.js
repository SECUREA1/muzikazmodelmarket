// Visual weather only: no movement, collision or authoritative world state changes.
export const WEATHER_MODES=Object.freeze({
 clear:{cloud:.3,rain:0,snow:0,haze:0,wind:.1,storm:0},
 overcast:{cloud:.78,rain:0,snow:0,haze:.12,wind:.3,storm:0},
 rain:{cloud:.85,rain:1,snow:0,haze:.2,wind:.4,storm:0},
 fog:{cloud:.65,rain:0,snow:0,haze:.85,wind:.05,storm:0},
 sleet:{cloud:.85,rain:.7,snow:.5,haze:.25,wind:.5,storm:0},
 snow:{cloud:.8,rain:0,snow:1,haze:.2,wind:.2,storm:0},
 blizzard:{cloud:.95,rain:0,snow:1,haze:.55,wind:1,storm:0},
 wind:{cloud:.55,rain:0,snow:0,haze:.15,wind:.9,storm:0},
 storm:{cloud:.98,rain:1,snow:0,haze:.3,wind:.8,storm:1},
 hurricane:{cloud:1,rain:1,snow:0,haze:.5,wind:1,storm:1}
});
const sequence=Object.keys(WEATHER_MODES);
export function simulatedWeather(initial='clear',milliseconds=0){
 const index=Math.max(0,sequence.indexOf(initial));
 return sequence[(index+Math.floor(Math.max(0,milliseconds)/180000))%sequence.length];
}
