"""Verify production laser feedback in real WebGL and Web Audio, including the first shot."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os,json
os.chdir(Path(__file__).resolve().parents[1])
source=Path('public/js/house-explorer-glb.js').read_text()
def methods(start,end):return source[source.index(start):source.index(end,source.index(start))]
production=methods('    initAudio(){','    rapidPopSound(){')+methods('    weaponMuzzle(','    registerLaserShot(')+methods('    fireExtraWeapon(','    fireFlame(')
fixture='''<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><button id="fire">Fire first laser</button><canvas></canvas><script type="module">
import * as THREE from '/public/vendor/three/three.module.min.js';
import {fireWeapon,RANGED_WEAPONS} from '/public/js/game-weapons.js';
const RANGE_WEAPONS=RANGED_WEAPONS,UTILITY_TOOLS={},rangeActive=false,playerPreferences={effectsVolume:80},supportsWorldTools=()=>true,canActivateTool=()=>true,gameplayOverlayOpen=()=>false;
class System { __METHODS__ }
const system=new System(),renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,preserveDrawingBuffer:true});renderer.setSize(innerWidth,360);renderer.setClearColor(0x000000);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(70,innerWidth/360,.1,100);camera.position.set(0,1.6,5);camera.updateMatrixWorld();Object.assign(system,{scene,camera,lasers:[],raycaster:new THREE.Raycaster(),audioAvailable:true,state:'active',getEnvironment:()=>({}),tool:'laser',ammo:100,weaponCooldown:0,bubbles:[],bricks:[],lootBlocks:[],avatarTargets:()=>[],flameColliders:()=>[],flameSystem:{sweep:()=>null},registerLaserShot(){}});
const origin=camera.getWorldPosition(new THREE.Vector3()),aim=camera.getWorldDirection(new THREE.Vector3());
function clear(){for(const effect of system.lasers){effect.geometry.dispose();effect.material.dispose();effect.removeFromParent();}system.lasers=[];}
function pixels(){renderer.render(scene,camera);const gl=renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);let lit=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])>80)lit++;return lit;}
window.verifyWeapons=()=>Object.keys(RANGED_WEAPONS).map(tool=>{clear();system.tool=tool;system.weaponCooldown=0;const before=system.ammo,fired=system.fireExtraWeapon(origin,aim),localPixels=pixels(),localEffects=system.lasers.length;clear();system.showWeaponShot(tool,origin,aim);return {tool,fired,spent:before-system.ammo,localPixels,sharedPixels:pixels(),localEffects};});
document.querySelector('#fire').addEventListener('click',async()=>{try{const fired=system.fireExtraWeapon(origin,aim),c=system.audioContext,analyser=c.createAnalyser();system.soundGain.disconnect();system.soundGain.connect(analyser);analyser.connect(c.destination);await system.audioResumePromise;await new Promise(resolve=>setTimeout(resolve,25));const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);window.report={fired,firstPixels:pixels(),state:c.state,peak:Math.max(...data.map(Math.abs))};}catch(error){window.error=error.message;}});
window.ready=true;
</script></html>'''.replace('__METHODS__',production)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width in (1280,390):
   page=browser.new_page(viewport={'width':width,'height':720});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__weapon_effects',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__weapon_effects');page.wait_for_function('window.ready');page.locator('#fire').click();page.wait_for_function('window.report || window.error')
   report=page.evaluate('window.report');assert report,page.evaluate('window.error');assert report['fired'] and report['state']=='running' and report['peak']>0 and report['firstPixels']>50,report
   weapons=page.evaluate('verifyWeapons()');assert all(item['fired'] and item['spent']==1 and item['localPixels']>50 and item['sharedPixels']>50 for item in weapons),weapons
   assert not errors,errors
   page.screenshot(path=f'/tmp/muzikaz-weapon-effects-{width}.png');print(json.dumps({'width':width,'firstShot':report,'weapons':len(weapons),'minimumVisiblePixels':min(item['localPixels'] for item in weapons)}),flush=True);page.close()
  browser.close()
finally:server.shutdown()
