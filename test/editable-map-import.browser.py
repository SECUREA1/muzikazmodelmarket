from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os,json
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1440,'height':1000},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('dialog',lambda d:d.accept());page.route('https://**/*',lambda r:r.abort())
  maps=json.loads(Path('public/models/environments/environments.json').read_text())
  live={'id':'live-marina-test','name':'Live marina test','playable':True,'proceduralLand':True,'builderScene':{'layout':'grand-floor','mapSize':400,'objects':[{'id':'test-yacht','modelId':'harbor-yacht','position':{'x':20,'y':0,'z':30},'functionalSettings':{'behavior':'vehicle'},'vehicleSettings':{'mode':'boat','speed':9}}]}}
  def api(r):
   if r.request.url.endswith('/api/environments'):r.fulfill(json={'data':[live]})
   elif r.request.url.endswith('/api/health'):r.fulfill(json={'success':True,'service':'muzikaz-member-market'})
   else:r.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]}})
  page.route('**/api/**',api)
  page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?setTimeout(()=>cb(performance.now()),150):raf(cb)")
  page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
  page.wait_for_function("window.MuzikazEnvironmentBuilder&&document.querySelector('#layout-select option[value=repository-live-marina-test]')",timeout=60000)
  for mapid,count in [('muzikaz-airport',next(m for m in maps if m['id']=='muzikaz-airport')['builderScene']['objects'].__len__()),('pixel-peaks-ski-resort',20),('live-marina-test',1)]:
   page.locator('#layout-select').evaluate('(el,value)=>{el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}))}','repository-'+mapid)
   page.wait_for_function("id=>window.MuzikazEnvironmentBuilder.getScene().sourceEnvironmentId===id&&!document.querySelector('#save-state').textContent.startsWith('Loading')",arg=mapid,timeout=60000)
   scene=page.evaluate('window.MuzikazEnvironmentBuilder.getScene()');assert len(scene['objects'])==count,(mapid,len(scene['objects']),page.locator('#save-state').inner_text())
   assert scene['mapSize']>=400
  scene=page.evaluate('window.MuzikazEnvironmentBuilder.getScene()');assert scene['objects'][0]['vehicleSettings']['mode']=='boat'
  assert not errors,errors;browser.close()
 print('Builder imports all 554 airport parts, full-size Pixel Peaks and a live map with a reusable yacht.')
finally:server.shutdown()
