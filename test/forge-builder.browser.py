"""Forge templates, station tuning, save/restore and publish retain gameplay."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os,time

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=.5,service_workers='block');errors=[];posted=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('dialog',lambda d:d.accept())
  def wait_builder(predicate,seconds=60):
   deadline=time.monotonic()+seconds
   while time.monotonic()<deadline:
    if page.evaluate(predicate):return
    time.sleep(.1)
   raise AssertionError({'waiting':predicate,'page_errors':errors,'actual':page.evaluate("({ready:!!window.MuzikazEnvironmentBuilder,game:window.MuzikazEnvironmentBuilder?.getScene()?.sourceGame,text:document.body.innerText.slice(0,1000)})")})

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
  # Rendering is covered by the full game browser; this fixture checks live
  # native geometry, tuning and persistence without software WebGL frame cost.
  page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?0:raf(cb)")
  page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html?layout=forge')
  wait_builder("window.MuzikazEnvironmentBuilder?.getScene().sourceGame==='forge'")
  def scene():return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
  print('Forge Builder ready',flush=True)
  initial=scene();assert len(initial['objects'])>50
  assert initial['sourceForge']['enabled'] and initial['sourceLayout']=='forge'
  wait_builder("window.MuzikazEnvironmentBuilder.getScene().objects.every(o=>window.MuzikazEnvironmentBuilder.getObject3D(o.id))")
  heights=page.evaluate('''async()=>{
   const T=await import('/public/vendor/three/three.module.min.js'),{placementBounds}=await import('/public/js/placed-item-collision.js');
   const scene=window.MuzikazEnvironmentBuilder.getScene();
   return ['forge-village-hall-floor','forge-village-hall-clerestory-cap','forge-dispatch-canopy'].map(id=>{
    const item=scene.objects.find(item=>item.id===id);if(!item)return null;
    const root=window.MuzikazEnvironmentBuilder.getObject3D(id),physical=placementBounds(T,root),bounds=physical.isEmpty()?new T.Box3().setFromObject(root):physical;return {id,authoredY:item.position.y,bottom:bounds.min.y,top:bounds.max.y};
   }).filter(Boolean);
  }''')
  print('All native models loaded; checking structural elevations',flush=True)
  assert len(heights)==3,heights
  for item in heights:assert abs(item['bottom']-item['authoredY'])<.001,('authored building elevation preserved',item)
  assert abs(next(item for item in heights if item['id']=='forge-village-hall-floor')['top'])<.001,heights
  assert next(item for item in heights if item['id']=='forge-village-hall-clerestory-cap')['bottom']>10,heights
  assert next(item for item in heights if item['id']=='forge-dispatch-canopy')['bottom']>6,heights
  assert page.locator('#library-category option[value=forge]').count()==1
  anvil=next(o for o in initial['objects'] if o['functionalSettings'].get('forgeStation')=='hammer')
  page.locator(f'[data-select-object="{anvil["id"]}"]').evaluate('(button)=>button.click()')
  assert page.locator('#forge-station-role').input_value()=='hammer'
  page.locator('#forge-approach-x').evaluate("field=>{field.value='2.5';field.dispatchEvent(new Event('change',{bubbles:true}));}")
  page.locator('#forge-station-enabled').evaluate("field=>{field.checked=false;field.dispatchEvent(new Event('change',{bubbles:true}));}")
  page.locator('#save-scene').click(no_wait_after=True)
  print('Forge tuning saved',flush=True)
  saved=scene();saved_anvil=next(o for o in saved['objects'] if o['id']==anvil['id'])
  assert saved_anvil['functionalSettings']['forgeApproach']['x']==2.5
  assert saved_anvil['functionalSettings']['forgeEnabled']==False
  assert not any(row['id']==anvil['id'] for row in saved['layoutMeta']['locations'])
  assert len(saved['layoutMeta']['residents'])==3
  print('Reloading saved forge',flush=True)
  page.reload();wait_builder("window.MuzikazEnvironmentBuilder?.getScene().sourceGame==='forge'")
  print('Saved forge restored',flush=True)
  restored=scene();assert len(restored['objects'])==len(saved['objects'])
  assert next(o for o in restored['objects'] if o['id']==anvil['id'])['functionalSettings']['forgeApproach']['x']==2.5
  print('Publishing saved forge',flush=True)
  page.locator('#play-scene').click(no_wait_after=True)
  page.wait_for_url('**/__forge_game',timeout=15000)
  assert len(posted)==1 and posted[0]['sourceGame']=='forge' and posted[0]['sourceForge']['enabled']
  assert posted[0]['layoutMeta']['forge']['enabled'] and len(posted[0]['objects'])==len(saved['objects'])
  assert not errors,errors
  print({'forge_template_objects':len(initial['objects']),'forge_builder_tune_restore_publish':'passed'})
  browser.close()
finally:server.shutdown()
