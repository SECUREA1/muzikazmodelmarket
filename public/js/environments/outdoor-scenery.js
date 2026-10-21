import * as THREE from '../../vendor/three/three.module.min.js';
export function outdoorProfile(environment){
 const layout=environment?.builderScene?.layout||environment?.layout||'';
 const indoor=environment?.indoor===true||environment?.outdoor===false||['hockey-arena','dungeon-maze','crystal-cavern','mega-mall','office-tower','creator-studios','movie-studio'].includes(layout)||/basketball/i.test(environment?.game||'');
 if(!environment||indoor)return null;
 const name=[environment.id,environment.name,layout].join(' ').toLowerCase();
 const coast=!!environment.builderScene?.layoutMeta?.harbor||/dock|coast|island|beach/.test(name),desert=/desert|dune/.test(name);
 const weather=environment.weather?.type||environment.weather||(/mountain|forest/.test(name)?'overcast':'clear');
 return {coast,desert,commons:environment.id==='public-commons',weather:typeof weather==='string'?weather:'clear',extent:Number(environment.builderScene?.layoutMeta?.harbor?.extent)||Math.max(40,Number(environment.builderScene?.mapSize)||Number(environment.playableSize)||256)/2};
}
export function createOutdoorScenery({scene}){
 const root=new THREE.Group();root.name='OUTDOOR_SKY_AND_HORIZON';root.userData={collisionDisabled:true,collider:false};scene.add(root);let profile=null,sky=null;
 const clear=()=>{for(const object of [...root.children]){object.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material?.dispose());});root.remove(object);}};
 return {get profile(){return profile;},setEnvironment(environment){clear();profile=outdoorProfile(environment);root.visible=!!profile;if(!profile){scene.background=new THREE.Color(0x050807);if(scene.fog)scene.fog.color.set(0x050807);return;}
  const cloudy=['overcast','rain','storm'].includes(profile.weather),horizon=new THREE.Color(cloudy?0xa7bdc6:profile.desert?0xe6c9a1:0xb5d8e9),zenith=new THREE.Color(cloudy?0x607d93:0x327dbe);
  scene.background=horizon;if(scene.fog)scene.fog.color.copy(horizon);
  sky=new THREE.Mesh(new THREE.SphereGeometry(620,40,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{time:{value:0},horizon:{value:horizon},zenith:{value:zenith},cloudCover:{value:cloudy?.78:.30},rain:{value:['rain','storm'].includes(profile.weather)?1:0}},vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`varying vec3 direction;uniform float time;uniform vec3 horizon;uniform vec3 zenith;uniform float cloudCover;uniform float rain;
   float noise(vec2 p){return sin(p.x)*sin(p.y)+.5*sin(p.x*2.1+p.y*.7)+.25*cos(p.y*4.3-p.x*.8);}
   void main(){vec3 d=normalize(direction);float height=max(0.,d.y);vec3 color=mix(horizon,zenith,smoothstep(0.,.8,height));vec2 uv=d.xz/max(.12,d.y+.2)*2.;float clouds=smoothstep(1.-cloudCover,1.4-cloudCover,noise(uv+vec2(time*.008,time*.003)));clouds*=smoothstep(.02,.2,height);color=mix(color,vec3(.96,.97,.98),clouds*.7);float sun=pow(max(0.,dot(d,normalize(vec3(-.4,.55,-.5)))),600.);color+=vec3(1.,.8,.45)*sun*(1.-cloudCover);float streak=step(.985,fract((d.x+d.z)*350.+time*1.8));color=mix(color,vec3(.73,.84,.9),rain*streak*.16);gl_FragColor=vec4(color,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')}));
  sky.name='WEATHER_SKY_SPHERE';sky.renderOrder=-100;sky.frustumCulled=false;root.add(sky);
  const groundShape=new THREE.Shape();groundShape.moveTo(-590,-590);groundShape.lineTo(590,-590);groundShape.lineTo(590,590);groundShape.lineTo(-590,590);groundShape.closePath();const edge=profile.extent+1,hole=new THREE.Path();hole.moveTo(-edge,-edge);hole.lineTo(-edge,edge);hole.lineTo(edge,edge);hole.lineTo(edge,-edge);hole.closePath();groundShape.holes.push(hole);
  const surround=new THREE.Mesh(new THREE.ShapeGeometry(groundShape),new THREE.MeshBasicMaterial({color:profile.coast?0x127b9a:profile.desert?0xbca16c:0x60795d,side:THREE.DoubleSide,fog:false}));surround.name='DISTANT_GROUND_SURROUND';surround.rotation.x=-Math.PI/2;surround.position.y=profile.coast?-.18:-.5;root.add(surround);
  // A full distant ring closes the view without extending the playable collider.
  const radius=Math.min(450,profile.extent+90),count=64;const geometry=profile.commons?new THREE.SphereGeometry(1,14,8):new THREE.ConeGeometry(1,1,6),material=new THREE.MeshStandardMaterial({color:profile.desert?0xa58c69:profile.coast?0x6a9295:0x587967,roughness:1,fog:false});const hills=new THREE.InstancedMesh(geometry,material,count);hills.name='DISTANT_LANDSCAPE_RING';const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion();
  for(let i=0;i<count;i++){const angle=i/count*Math.PI*2,scale=22+(Math.sin(i*7.13)+1)*22,height=profile.commons?20+(Math.sin(i*2.8)+1)*8:profile.coast?16+(Math.sin(i*2.8)+1)*10:30+(Math.sin(i*3.8)+1)*35;matrix.compose(new THREE.Vector3(Math.sin(angle)*radius,profile.commons?-height*.35:-8+height/2,Math.cos(angle)*radius),quaternion,new THREE.Vector3(scale,height,scale));hills.setMatrixAt(i,matrix);}root.add(hills);
 },update(elapsed,camera){if(!profile||!sky)return;sky.position.copy(camera.getWorldPosition(new THREE.Vector3()));sky.material.uniforms.time.value=elapsed;if(scene.fog){scene.fog.near=Math.max(scene.fog.near,profile.extent*.7);scene.fog.far=Math.max(scene.fog.far,profile.extent*3);}},dispose(){clear();root.removeFromParent();}};
}
