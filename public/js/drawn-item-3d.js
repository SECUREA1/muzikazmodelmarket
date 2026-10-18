// A bounded raster extrusion preserves painted colors and transparent cutouts.
export function artworkCells(data,width,height,settings={}){
 const cells=[],base=Math.max(.01,Math.min(.5,(Number(settings.depth)||28)/200));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const offset=(y*width+x)*4;if(data[offset+3]<96)continue;
 const color=[data[offset],data[offset+1],data[offset+2]],relief=settings.depthMode==='relief'?.25+.75*(color[0]+color[1]+color[2])/765:1;
 cells.push({x:(x+.5)/width*1.5-.75,y:1.5-(y+.5)/height*1.5,depth:base*relief,color});
 }return cells;
}
export function extrudeArtwork(THREE,source,settings={}){
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,64,64);
 const cells=artworkCells(context.getImageData(0,0,64,64).data,64,64,settings),root=new THREE.Group();
 const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({roughness:.55,metalness:settings.material==='metal'?.7:.08});
 const mesh=new THREE.InstancedMesh(geometry,material,cells.length),matrix=new THREE.Matrix4(),color=new THREE.Color();
 cells.forEach((cell,index)=>{matrix.makeScale(1.5/64,1.5/64,cell.depth);matrix.setPosition(cell.x,cell.y,cell.depth/2);mesh.setMatrixAt(index,matrix);color.setRGB(...cell.color.map(value=>value/255),THREE.SRGBColorSpace);mesh.setColorAt(index,color);});
 root.add(mesh);root.rotation.set((Number(settings.tilt)||0)*Math.PI/180,(Number(settings.yaw)||0)*Math.PI/180,(Number(settings.orientation)||0)*Math.PI/180);if(settings.mirrored)root.scale.x=-1;return root;
}
export async function createDrawingPreview(host){
 const THREE=await import('../vendor/three/three.module.min.js'),{OrbitControls}=await import('../vendor/three/addons/controls/OrbitControls.js');
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,30);camera.position.set(0,1.3,3.3);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.75,0);controls.enablePan=false;controls.minDistance=1.3;controls.maxDistance=7;
 scene.add(new THREE.HemisphereLight(0xffffff,0x35415b,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,3,4);scene.add(light);
 let model,frame;const render=()=>{renderer.render(scene,camera);};controls.addEventListener('change',render);
 const observer=new ResizeObserver(()=>{const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();});observer.observe(host);
 return {update(source,settings){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(model){scene.remove(model);model.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});}model=extrudeArtwork(THREE,source,settings);scene.add(model);render();});},reset(){camera.position.set(0,1.3,3.3);controls.target.set(0,.75,0);controls.update();render();}};
}
