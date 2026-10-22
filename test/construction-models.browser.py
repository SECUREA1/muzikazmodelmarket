from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
 def do_GET(self):
  if self.path == '/construction-clone-fixture':
   self.send_response(200); self.send_header('Content-Type', 'text/html'); self.end_headers()
   self.wfile.write(b'<!doctype html><title>Construction dashboard cloning</title>')
  else: super().do_GET()
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  page = browser.new_page(service_workers='block'); errors=[]
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/construction-clone-fixture')
  result = page.evaluate('''async () => {
   const {createConstructionModel,updateConstructionModel}=await import('/public/js/construction-models.js');
   const {cloneBuilderRuntime}=await import('/public/js/builder-runtime-clone.js');
   const check=(value,message)=>{if(!value)throw Error(message);};
   const verified=[];
   for(const id of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){
    const source=createConstructionModel(id),sourceDash=source.userData.constructionParts.dash;
    source.userData.construction={hoist:20,trolley:15,load:2};source.userData.driving={speed:1,parked:false};updateConstructionModel(source,1);
    const sourceCanvas=sourceDash.material.map.image,before=sourceCanvas.toDataURL(),copy=cloneBuilderRuntime(source);
    copy.userData.construction={hoist:55,trolley:35,load:8,bed:.8,blade:1,boom:1.1,stick:-1.1,bucket:.5};copy.userData.driving={speed:5,parked:true};
    updateConstructionModel(copy,2);
    const copyDash=copy.userData.constructionParts.dash,texture=copyDash.material.map,copyCanvas=texture.image;
    check(copyDash!==sourceDash,id+' mesh ref points at source');
    check(copyDash.material!==sourceDash.material,id+' material is shared');
    check(texture!==sourceDash.material.map&&texture.isCanvasTexture,id+' texture is shared or lost native type');
    check(sourceCanvas instanceof HTMLCanvasElement&&copyCanvas instanceof HTMLCanvasElement,id+' canvas lost native type');
    check(copyCanvas!==sourceCanvas,id+' canvas shared');
    check(copyCanvas.getContext('2d')!==sourceCanvas.getContext('2d'),id+' contexts shared');
    check(sourceCanvas.toDataURL()===before,id+' copy redraw altered original');
    check(copyCanvas.toDataURL()!==before,id+' copy instruments did not show own state');
    const copiedBefore=copyCanvas.toDataURL();source.userData.driving.speed=8;source.userData.construction.hoist=70;updateConstructionModel(source,3);
    check(copyCanvas.toDataURL()===copiedBefore,id+' source redraw altered copy');
    const rig=copy.userData.constructionParts;for(const ram of rig.hydraulics)check(ram.rod.isMesh&&Number.isFinite(ram.rod.scale.y),id+' cloned ram is invalid');
    if(id==='site-excavator'){
     const ctx=sourceCanvas.getContext('2d'),labels=[],drawText=ctx.fillText.bind(ctx);ctx.fillText=(text,...args)=>{labels.push(text);return drawText(text,...args);};
     source.userData.construction={boom:1.2,stick:-.4,bucket:-.6,load:3,axes:{slew:1,boom:-.5,stick:.7,bucket:-1},blocked:true};source.userData.driving={speed:0,blocked:false};updateConstructionModel(source,4);
     check(labels.includes('69°')&&labels.includes('-23°')&&labels.includes('-34°'),'Dashboard did not redraw actual joint states');
     check(labels.includes('SLEW 100%')&&labels.includes('BOOM -50%'),'Dashboard input feedback does not match active controls');
     check(labels.includes('IMPLEMENT BLOCKED'),'Dashboard omitted real blocked state');
     check(source.userData.constructionParts.joysticks.some(({mesh})=>Math.abs(mesh.rotation.z)>.1),'Cab joystick does not follow actual control axes');
     check(!labels.some(label=>label.includes('HYDRAULICS OK')||label.includes('SERVER LINK ACTIVE')),'Dashboard contains invented telemetry');
    }
    verified.push(id);
   }
   return verified;
  }''')
  assert len(result)==4,result
  assert not errors,errors
  browser.close()
 print('Four construction machine copies have independent native canvas dashboards, materials, textures and hydraulic rigs.')
finally:
 server.shutdown()
