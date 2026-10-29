import {WEATHER_MODES,simulatedWeather} from '../weather-cycle.js';
import * as THREE from '../../vendor/three/three.module.min.js';
export function outdoorProfile(environment){
 const layout=environment?.builderScene?.sourceLayout||environment?.builderScene?.layout||environment?.layout||'';
 const indoor=environment?.indoor===true||environment?.outdoor===false||['clown-funhouse','casino','fitness-centre','hockey-arena','dungeon-maze','crystal-cavern','mega-mall','office-tower','creator-studios','movie-studio'].includes(layout)||/basketball/i.test(environment?.game||'');
 if(!environment||indoor)return null;
 const name=[environment.id,environment.name,layout].join(' ').toLowerCase();
 const coast=!!environment.builderScene?.layoutMeta?.harbor||/dock|coast|island|beach/.test(name),desert=/desert|dune/.test(name);
 const weather=environment.weather?.type||environment.weather||(/mountain|forest/.test(name)?'overcast':'clear');
 return {ski:environment.game==='ski',forest:layout==='forest-harvest'||environment.id==='forest-harvest',coast,desert,commons:environment.id==='public-commons',weather:typeof weather==='string'?weather:'clear',extent:Number(environment.builderScene?.layoutMeta?.harbor?.extent)||Math.max(40,Number(environment.builderScene?.mapSize)||Number(environment.playableSize)||256)/2};
}

const skyFragmentShader=`
 varying vec3 direction;
 uniform float time;
 uniform vec3 horizon;
 uniform vec3 zenith;
 uniform float cloudCover;
 uniform float rain;
 uniform float snow;
 uniform float haze;
 uniform float wind;
 uniform float storm;
 uniform float lightning;
 uniform float hurricane;
 uniform float daylight;
 uniform float twilight;
 uniform float night;
 uniform vec3 sunDirection;
 uniform vec3 moonDirection;
 uniform float sunVisibility;
 uniform float moonVisibility;
 float noise(vec2 p){return sin(p.x)*sin(p.y)+.5*sin(p.x*2.1+p.y*.7)+.25*cos(p.y*4.3-p.x*.8);}
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){
  vec3 d=normalize(direction);
  float height=max(0.,d.y);
  vec3 color=mix(horizon,zenith,smoothstep(0.,.8,height));
  vec2 uv=d.xz/max(.12,d.y+.2)*2.;
  float clouds=smoothstep(1.-cloudCover,1.4-cloudCover,noise(uv+vec2(time*(.008+wind*.05),time*.003)+hurricane*vec2(sin(length(uv)*3.+time*.05),cos(length(uv)*3.+time*.05))));
  clouds*=smoothstep(.02,.2,height);
  vec3 cloudColor=mix(vec3(.035,.052,.09),vec3(.96,.97,.98),daylight);
  cloudColor=mix(cloudColor,vec3(.57,.29,.24),twilight*.55);
  color=mix(color,cloudColor,clouds*.7);
  float clearSky=1.-clouds*.85;
  // Stars stay anchored to the sky while cloud animation follows motion settings.
  vec2 starUV=vec2(atan(d.z,d.x),asin(clamp(d.y,-1.,1.)))*150.;
  vec2 cell=floor(starUV),offset=fract(starUV)-vec2(hash(cell),hash(cell+19.));
  float stars=(1.-smoothstep(.015,.075,length(offset)))*step(.985,hash(cell+3.));
  color+=vec3(.65,.77,1.)*stars*night*clearSky*smoothstep(.02,.18,height);
  vec3 sunDir=normalize(sunDirection),moonDir=normalize(moonDirection);
  float sunDot=max(0.,dot(d,sunDir));
  float sunDisc=smoothstep(cos(.020),cos(.016),sunDot);
  float sunHalo=pow(sunDot,35.)*.22+pow(sunDot,180.)*.6;
  vec3 sunTangent=normalize(cross(sunDir,vec3(0.,0.,1.)));
  float rayAngle=atan(dot(d,cross(sunDir,sunTangent)),dot(d,sunTangent));
  float sunRays=pow(max(0.,cos(rayAngle*8.)),12.)*pow(sunDot,75.)*.12;
  color+=vec3(1.,.77,.38)*(sunDisc*4.+sunHalo+sunRays)*sunVisibility*clearSky;
  float moonDot=max(0.,dot(d,moonDir));
  float moonDisc=smoothstep(cos(.027),cos(.025),moonDot);
  vec3 moonTangent=normalize(cross(moonDir,vec3(0.,0.,1.)));
  vec2 moonUV=vec2(dot(d,moonTangent),dot(d,cross(moonDir,moonTangent)))/.026;
  float craters=.76+.13*noise(moonUV*8.)+.06*noise(moonUV*19.);
  float moonHalo=pow(moonDot,80.)*.13+pow(moonDot,500.)*.25;
  color+=vec3(.68,.81,1.)*(moonDisc*craters*2.5+moonHalo)*moonVisibility*clearSky;
  float streak=step(.985,fract((d.x+d.z+wind*d.y*.5)*350.+time*(1.8+wind*2.)));
  color=mix(color,mix(vec3(.10,.16,.24),vec3(.73,.84,.9),daylight),rain*streak*.16);
  vec2 snowUV=d.xz/max(.12,d.y+.4)*65.+vec2(time*(.4+wind*3.),time*1.6);
  float flakes=(1.-smoothstep(.04,.14,length(fract(snowUV)-.5)))*step(.7,hash(floor(snowUV)));
  color=mix(color,vec3(.85,.91,1.),snow*flakes*.8);
  color=mix(color,horizon,haze*(1.-smoothstep(0.,.5,height))*.8);
  float bolt=1.-smoothstep(.002,.006,abs(d.x-.35-.015*sin(d.y*65.)));
  bolt*=smoothstep(.05,.15,d.y)*(1.-smoothstep(.5,.6,d.y));
  color+=vec3(.65,.73,.9)*lightning*storm*(bolt*.7+clouds*.04);
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`;

export function createOutdoorScenery({scene,now=Date.now,onThunder=()=>{}}){
 const root=new THREE.Group();root.name='OUTDOOR_SKY_AND_HORIZON';root.userData={collisionDisabled:true,collider:false};scene.add(root);
 let localWeather=null,appliedWeather=null,profile=null,sky=null,surround=null,dayHorizon=null,dayZenith=null,dayGround=null;
 let weatherStarted=now(),lastWeatherTime=now(),lastThunder=-1;
 const weatherHorizon=new THREE.Color(),weatherZenith=new THREE.Color();
 const nightHorizon=new THREE.Color(0x14233d),nightZenith=new THREE.Color(0x030817),duskHorizon=new THREE.Color(0xdb8462),duskZenith=new THREE.Color(0x413c6d);
 const cameraPosition=new THREE.Vector3();
 const clear=()=>{for(const object of [...root.children]){object.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material?.dispose());});root.remove(object);}sky=null;surround=null;};
 function applyWeather(blend=1){
  if(!sky)return;
  const weather=localWeather||simulatedWeather(profile.weather,now()-weatherStarted);
  appliedWeather=weather;
  const mode=WEATHER_MODES[weather]||WEATHER_MODES.clear;
  weatherHorizon.set(mode.cloud>.6?0xa7bdc6:profile.desert?0xe6c9a1:0xb5d8e9);
  weatherZenith.set(mode.storm?0x3e5064:mode.cloud>.6?0x607d93:0x327dbe);
  dayHorizon.lerp(weatherHorizon,blend);dayZenith.lerp(weatherZenith,blend);
  const u=sky.material.uniforms;
  for(const [key,value]of Object.entries({cloudCover:mode.cloud,rain:mode.rain,snow:mode.snow,haze:mode.haze,wind:mode.wind,storm:mode.storm,hurricane:weather==='hurricane'?1:0}))u[key].value+=(value-u[key].value)*blend;
 }
 function applyDayNight(state){
  if(!sky)return;
  const u=sky.material.uniforms;
  const daylight=THREE.MathUtils.clamp(state?.daylight??1,0,1),twilight=THREE.MathUtils.clamp(state?.twilight??0,0,1);
  u.daylight.value=daylight;u.twilight.value=twilight;u.night.value=THREE.MathUtils.clamp(state?.night??(1-daylight),0,1);
  u.sunVisibility.value=state?.sunVisibility??1;u.moonVisibility.value=state?.moonVisibility??0;
  if(state?.sunDirection)u.sunDirection.value.copy(state.sunDirection);else u.sunDirection.value.set(-.4,.55,-.5).normalize();
  if(state?.moonDirection)u.moonDirection.value.copy(state.moonDirection);else u.moonDirection.value.copy(u.sunDirection.value).negate();
  u.horizon.value.copy(nightHorizon).lerp(dayHorizon,daylight).lerp(duskHorizon,twilight*.7);
  u.zenith.value.copy(nightZenith).lerp(dayZenith,daylight).lerp(duskZenith,twilight*.45);
  scene.background.copy(u.horizon.value);if(scene.fog)scene.fog.color.copy(u.horizon.value);
  // The unlit distant ground must darken with the lit world too.
  surround.material.color.copy(dayGround).multiplyScalar(.13+.87*daylight+twilight*.13);
 }
 return {setLocalWeather(weather){localWeather=weather;applyWeather();},get weather(){return appliedWeather;},get profile(){return profile;},setEnvironment(environment,dayNight=null){
  clear();appliedWeather=null;weatherStarted=lastWeatherTime=now();lastThunder=-1;profile=outdoorProfile(environment);root.visible=!!profile;
  if(!profile){scene.background=new THREE.Color(0x050807);if(scene.fog)scene.fog.color.set(0x050807);return;}
  const cloudy=['overcast','rain','storm'].includes(profile.weather);
  dayHorizon=new THREE.Color(cloudy?0xa7bdc6:profile.desert?0xe6c9a1:0xb5d8e9);dayZenith=new THREE.Color(cloudy?0x607d93:0x327dbe);
  scene.background=dayHorizon.clone();if(scene.fog)scene.fog.color.copy(dayHorizon);
  sky=new THREE.Mesh(new THREE.SphereGeometry(profile.ski?2600:620,40,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{time:{value:0},horizon:{value:dayHorizon.clone()},zenith:{value:dayZenith.clone()},cloudCover:{value:cloudy?.78:.30},haze:{value:0},wind:{value:0},storm:{value:0},lightning:{value:0},hurricane:{value:0},snow:{value:0},rain:{value:['rain','storm'].includes(profile.weather)?1:0},daylight:{value:1},twilight:{value:0},night:{value:0},sunDirection:{value:new THREE.Vector3(-.4,.55,-.5).normalize()},moonDirection:{value:new THREE.Vector3(.4,-.55,.5).normalize()},sunVisibility:{value:1},moonVisibility:{value:0}},vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:skyFragmentShader}));
  sky.name='WEATHER_SKY_SPHERE';sky.renderOrder=-100;sky.frustumCulled=false;root.add(sky);
  const surroundExtent=profile.ski?2400:590;const groundShape=new THREE.Shape();groundShape.moveTo(-surroundExtent,-surroundExtent);groundShape.lineTo(surroundExtent,-surroundExtent);groundShape.lineTo(surroundExtent,surroundExtent);groundShape.lineTo(-surroundExtent,surroundExtent);groundShape.closePath();const edge=profile.extent+1,hole=new THREE.Path();hole.moveTo(-edge,-edge);hole.lineTo(-edge,edge);hole.lineTo(edge,edge);hole.lineTo(edge,-edge);hole.closePath();groundShape.holes.push(hole);
  dayGround=new THREE.Color(profile.ski?0xd8e8f3:profile.coast?0x127b9a:profile.desert?0xbca16c:0x60795d);
  surround=new THREE.Mesh(new THREE.ShapeGeometry(groundShape),new THREE.MeshBasicMaterial({color:dayGround,side:THREE.DoubleSide,fog:false}));surround.name='DISTANT_GROUND_SURROUND';surround.rotation.x=-Math.PI/2;surround.position.y=profile.coast?-.18:-.5;root.add(surround);
  // A full distant ring closes the view without extending the playable collider.
  const radius=profile.ski?1000:Math.min(450,profile.extent+90),count=64;const geometry=profile.forest?new THREE.SphereGeometry(1,32,20):profile.commons?new THREE.SphereGeometry(1,14,8):new THREE.ConeGeometry(1,1,6),material=new THREE.MeshStandardMaterial({color:profile.ski?0xc6dce9:profile.desert?0xa58c69:profile.coast?0x6a9295:0x587967,roughness:1,fog:false});if(profile.forest){const positions=geometry.getAttribute('position');for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),scale=1+.07*Math.sin(x*7+z*5)+.04*Math.sin(z*13-y*9);positions.setXYZ(i,x*scale,y*scale,z*scale);}geometry.computeVertexNormals();}const hills=new THREE.InstancedMesh(geometry,material,count);hills.name='DISTANT_LANDSCAPE_RING';const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion();
  for(let i=0;i<count;i++){const angle=i/count*Math.PI*2,scale=22+(Math.sin(i*7.13)+1)*22,height=profile.forest?16+(Math.sin(i*2.8)+1)*12:profile.commons?20+(Math.sin(i*2.8)+1)*8:profile.coast?16+(Math.sin(i*2.8)+1)*10:30+(Math.sin(i*3.8)+1)*35;matrix.compose(new THREE.Vector3(Math.sin(angle)*radius,profile.commons?-height*.35:-8+height/2,Math.cos(angle)*radius),quaternion,new THREE.Vector3(scale,height,scale));hills.setMatrixAt(i,matrix);}root.add(hills);
  applyWeather();applyDayNight(dayNight);
 },update(elapsed,camera,dayNight=null){
  if(!profile||!sky)return;
  const timestamp=now(),delta=Math.min(2,Math.max(0,(timestamp-lastWeatherTime)/1000));lastWeatherTime=timestamp;
  applyWeather(1-Math.exp(-delta/5));
  const u=sky.material.uniforms,bucket=Math.floor(elapsed/27),phase=elapsed%27;
  // A single distant bolt, no rapid flashes; elapsed=0 disables it for reduced motion.
  u.lightning.value=elapsed>0&&phase>2&&phase<2.4?Math.sin((phase-2)/.4*Math.PI):0;
  if(elapsed>0&&u.storm.value>.5&&phase>3&&phase<5&&bucket!==lastThunder){lastThunder=bucket;onThunder();}
  sky.position.copy(camera.getWorldPosition(cameraPosition));sky.material.uniforms.time.value=elapsed;applyDayNight(dayNight);
  if(scene.fog){scene.fog.near=Math.max(scene.fog.near,profile.extent*.7);scene.fog.far=Math.max(scene.fog.far,profile.extent*3);}
 },dispose(){clear();root.removeFromParent();}};
}
