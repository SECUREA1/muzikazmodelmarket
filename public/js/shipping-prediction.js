// Network handling packets contain only neutral axes so a delayed packet can
// never lower the anchor or cancel a newly accepted automatic departure.
// The local preview still needs the server's dock lock while a crane works.
export function shippingPredictedControls(input,phase){
 return ['loading','secured','unloading'].includes(phase)?{...input,side:0,forward:0,rudder:0,throttle:0,anchor:true,jump:false,sprint:false,firing:false}:input;
}
