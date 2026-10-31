"""Forge templates, station tuning, save/restore and publish retain gameplay."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1440,'height':900},service_workers='block');errors=[];posted=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('dialog',lambda d:d.accept())
  page.route('https://**/*',lambda r:r.abort())
  def api(route):
   url=route.request.url
   if url.endswith('/api/health'):route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
   elif url.endswith('/api/market/session'):route.fulfill(json={'data':{'account':{'accountId':'forge-builder','username':'Smith'},'csrfToken':'test-csrf'}})
   elif url.endswith('/api/custom-maps') and route.request.method=='POST':
    posted.append(route.request.post_data_json['scene']);route.fulfill(json={'data':{'playUrl':'/__forge_game','name':'My forge'}})
   else:route.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]})
  page.route('**/api/**',api)
  page.route('**/__forge_game',lambda r:r.fulfill(body='<h1>Playable forge</h1>',content_type='text/html'))
  page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?setTimeout(()=>cb(performance.now()),150):raf(cb)")
  page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html?layout=forge')
  page.wait_for_function("window.MuzikazEnvironmentBuilder?.getScene().sourceGame==='forge'",timeout=30000)
  def scene():return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
  initial=scene();assert len(initial['objects'])>50
  assert initial['sourceForge']['enabled'] and initial['sourceLayout']=='forge'
  page.wait_for_function("window.MuzikazEnvironmentBuilder.getScene().objects.every(o=>window.MuzikazEnvironmentBuilder.getObject3D(o.id))",timeout=30000)
  assert page.locator('#library-category option[value=forge]').count()==1
  anvil=next(o for o in initial['objects'] if o['functionalSettings'].get('forgeStation')=='hammer')
  page.locator(f'[data-select-object="{anvil["id"]}"]').evaluate('(button)=>button.click()')
  assert page.locator('#forge-station-role').input_value()=='hammer'
  page.locator('#forge-approach-x').evaluate("field=>{field.value='2.5';field.dispatchEvent(new Event('change',{bubbles:true}));}")
  page.locator('#forge-station-enabled').evaluate("field=>{field.checked=false;field.dispatchEvent(new Event('change',{bubbles:true}));}")
  page.locator('#save-scene').evaluate('(button)=>button.click()')
  saved=scene();saved_anvil=next(o for o in saved['objects'] if o['id']==anvil['id'])
  assert saved_anvil['functionalSettings']['forgeApproach']['x']==2.5
  assert saved_anvil['functionalSettings']['forgeEnabled']==False
  assert not any(row['id']==anvil['id'] for row in saved['layoutMeta']['locations'])
  assert len(saved['layoutMeta']['residents'])==3
  page.reload();page.wait_for_function("window.MuzikazEnvironmentBuilder?.getScene().sourceGame==='forge'")
  restored=scene();assert len(restored['objects'])==len(saved['objects'])
  assert next(o for o in restored['objects'] if o['id']==anvil['id'])['functionalSettings']['forgeApproach']['x']==2.5
  page.locator('#play-scene').evaluate('(button)=>button.click()')
  page.wait_for_url('**/__forge_game',timeout=15000)
  assert len(posted)==1 and posted[0]['sourceGame']=='forge' and posted[0]['sourceForge']['enabled']
  assert posted[0]['layoutMeta']['forge']['enabled'] and len(posted[0]['objects'])==len(saved['objects'])
  assert not errors,errors
  print({'forge_template_objects':len(initial['objects']),'forge_builder_tune_restore_publish':'passed'})
  browser.close()
finally:server.shutdown()
