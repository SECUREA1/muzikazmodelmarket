"""World maps and placeable inlays keep separate choices, visibility and saved data."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os, struct, base64
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
raw=struct.pack('<12f6H',-10,0,-10,10,0,-10,10,0,10,-10,0,10,0,2,1,0,3,2)
gltf={'asset':{'version':'2.0'},'scene':0,'scenes':[{'name':'wide-floor-scene','nodes':[0]}],'nodes':[{'mesh':0}], 'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1}]}], 'buffers':[{'byteLength':len(raw),'uri':'data:application/octet-stream;base64,'+base64.b64encode(raw).decode()}], 'bufferViews':[{'buffer':0,'byteLength':48},{'buffer':0,'byteOffset':48,'byteLength':12}], 'accessors':[{'bufferView':0,'componentType':5126,'count':4,'type':'VEC3','min':[-10,0,-10],'max':[10,0,10]},{'bufferView':1,'componentType':5123,'count':6,'type':'SCALAR'}]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in ((1440,900),(390,844)):
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<760,service_workers='block');errors=[];posted=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('dialog',lambda d:d.accept())
   page.route('https://**/*',lambda r:r.abort())
   page.route('**/public/models/environments/environments.json',lambda r:r.fulfill(json=[{'id':'wide-test','name':'Wide test world','modelUrl':'/__base.gltf','playableSize':80}]))
   page.route('**/__base.gltf',lambda r:r.fulfill(json=gltf))
   page.route('**/__inlay_game',lambda r:r.fulfill(body='<h1>Playable saved world</h1>',content_type='text/html'))
   def api(route):
    if route.request.url.endswith('/api/health'):route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
    elif route.request.url.endswith('/api/market/session'):route.fulfill(json={'data':{'account':{'accountId':'map-builder','username':'Builder'},'csrfToken':'test-csrf'}})
    elif route.request.url.endswith('/api/custom-maps') and route.request.method=='POST':
     posted.append(route.request.post_data_json['scene']);route.fulfill(json={'data':{'playUrl':'/__inlay_game','name':'Saved world'}})
    else:route.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]})
   page.route('**/api/**',api)
   page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?setTimeout(()=>cb(performance.now()),150):raf(cb)")
   page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
   page.wait_for_function("window.MuzikazEnvironmentBuilder && document.querySelector('#layout-select option[value=repository-wide-test]')")
   def scene():return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
   def choose(screen):
    if width<760 and not page.locator('body').evaluate("n=>n.classList.contains('builder-library-open')"):page.locator('#touch-open-library').click()
    page.get_by_label('Item panel screen',exact=True).select_option(screen)
   def reveal(selector):
    for _ in range(50):
     if page.locator(selector).is_visible():return page.locator(selector)
     page.locator('#library-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
    raise AssertionError(selector)
   choose('maps');reveal('select[aria-label="Large world map"]').select_option('mountain-pass')
   page.get_by_label('Show large world (editor)',exact=True).uncheck()
   assert scene()['editorSettings']['worldVisible']==False
   choose('inlays')
   assert page.get_by_label('Small inlay map',exact=True).locator('option').count()==8
   page.get_by_label('Show small inlays (editor)',exact=True).uncheck()
   page.get_by_label('Small inlay map',exact=True).select_option('open-studio')
   assert scene()['layout']=='mountain-pass' and len(scene()['objects'])==0
   reveal('button:has-text("Place small inlay")').click();page.locator('#touch-place-center').click()
   assert scene()['layout']=='mountain-pass' and len(scene()['objects'])==1
   room=scene()['objects'][0];room_id=room['id']
   assert room['modelId']=='open-studio' and room['builderLayer']=='inlay'
   assert scene()['editorSettings']['worldVisible']==False and scene()['editorSettings']['inlaysVisible']==True
   assert page.evaluate('(id)=>window.MuzikazEnvironmentBuilder.getObject3D(id).visible',room_id)
   choose('maps');reveal('select[aria-label="Large world map"]').select_option('urban-downtown')
   preserved=next(o for o in scene()['objects'] if o['id']==room_id)
   assert preserved['position']['x']==room['position']['x'] and preserved['position']['z']==room['position']['z']
   assert len([o for o in scene()['objects'] if o['id']==room_id])==1
   assert scene()['editorSettings']['inlayMapId']=='open-studio'
   choose('inlays');assert page.get_by_label('Small inlay map',exact=True).input_value()=='open-studio'
   assert page.locator('[data-inlay-object]').count()==1,'Generated world compounds belong to the world setup'
   page.get_by_label('Show small inlays (editor)',exact=True).uncheck()
   assert not page.evaluate('(id)=>window.MuzikazEnvironmentBuilder.getObject3D(id).visible',room_id)
   choose('maps');page.get_by_label('Show large world (editor)',exact=True).check()
   assert scene()['editorSettings']['inlaysVisible']==False
   reveal('select[aria-label="Large world map"]').select_option('repository-wide-test')
   page.wait_for_function("window.MuzikazEnvironmentBuilder.getScene().baseEnvironment?.id==='wide-test' && !document.querySelector('#save-state').textContent.startsWith('Loading')")
   assert any(o['id']==room_id for o in scene()['objects'])
   choose('inlays');assert page.get_by_label('Small inlay map',exact=True).input_value()=='open-studio'
   page.get_by_label('Show small inlays (editor)',exact=True).check()
   choose('games');reveal('[data-builder-screen=games] button:has-text("Save draft")').click()
   saved_position=next(o for o in scene()['objects'] if o['id']==room_id)['position']
   page.reload();page.wait_for_function("window.MuzikazEnvironmentBuilder && document.body.classList.contains('builder-paged-workspace')")
   assert scene()['baseEnvironment']['id']=='wide-test'
   assert next(o for o in scene()['objects'] if o['id']==room_id)['position']==saved_position, 'Restoring a GLB world must keep inlay coordinates'
   assert next(o for o in scene()['objects'] if o['id']==room_id)['builderLayer']=='inlay'
   choose('inlays');assert page.get_by_label('Small inlay map',exact=True).input_value()=='open-studio'
   assert page.locator('[data-inlay-object]').count()==1
   choose('games');reveal('[data-builder-screen=games] button:has-text("Test this map")').click()
   page.wait_for_url('**/__inlay_game',timeout=12000)
   assert len(posted)==1 and posted[0]['baseEnvironment']['id']=='wide-test'
   saved=next(o for o in posted[0]['objects'] if o['id']==room_id)
   assert saved['modelId']=='open-studio' and saved['asset']['buildAssetId']=='open-studio'
   assert not errors,errors
   print({'viewport':[width,height],'independent_choices_visibility_generation_save_test':'passed'},flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
