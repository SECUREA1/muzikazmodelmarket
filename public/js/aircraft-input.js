// A small center dead zone and gentle response make fine touch corrections easy.
export function flightStickAxes(x,y){
 const a=Number.isFinite(x)?x:0,b=Number.isFinite(y)?y:0,length=Math.hypot(a,b);if(length<=.08)return {x:0,y:0};const magnitude=Math.min(1,(length-.08)/.92),response=magnitude*(.6+.4*magnitude);return {x:a/length*response,y:b/length*response};
}
