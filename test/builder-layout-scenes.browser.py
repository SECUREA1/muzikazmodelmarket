"""Camp maps, additive scenes and individual items use the real builder controls."""
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
  for width,height in ((1440,900),(390,844)):
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<760,service_workers='block');errors=[];posted=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
   page.route('https://**/*',lambda r:r.abort())
   page.route('**/__camp_game',lambda r:r.fulfill(body='<h1>Camp saved for play</h1>',content_type='text/html'))
   def api(route):
    if route.request.url.endswith('/api/health'):route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
    elif route.request.url.endswith('/api/market/session'):route.fulfill(json={'data':{'account':{'accountId':'camp-builder','username':'Camper'},'csrfToken':'test-csrf'}})
    elif route.request.url.endswith('/api/custom-maps') and route.request.method=='POST':
     posted.append(route.request.post_data_json['scene']);route.fulfill(json={'data':{'playUrl':'/__camp_game','name':'Summer camp'}})
    else:route.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]})
   page.route('**/api/**',api)
   # This checks DOM controls and saved scene state. Disable the preview animation
   # loop so software WebGL cannot starve input; game motion is tested separately.
   page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?0:raf(cb)")
   page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
   page.wait_for_function("window.MuzikazEnvironmentBuilder && document.querySelector('#layout-select option[value=camp-lakeside]')")
   def scene():return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
   def choose(screen):
    if width<760 and page.locator('body').evaluate("n=>n.classList.contains('inspector-open')"):page.locator('.builder-inspector-home').click()
    elif width<760 and not page.locator('body').evaluate("n=>n.classList.contains('builder-library-open')"):page.locator('#touch-open-library').click()
    page.get_by_label('Item panel screen',exact=True).select_option(screen)
   def reveal(selector,panel='#library-panel'):
    for _ in range(60):
     if page.locator(selector).is_visible():return page.locator(selector)
     next_button=page.locator(panel+' .builder-panel-pagination').get_by_role('button',name='Next',exact=True)
     assert next_button.is_enabled(),selector
     next_button.click()
    raise AssertionError(selector)
   def fits():
    page.wait_for_timeout(90)
    viewport=page.locator('#library-panel .builder-panel-viewport').bounding_box();screen=page.locator('#library-panel .builder-page-screen:not([hidden])').bounding_box()
    assert screen['height']<=viewport['height']+1,(width,screen,viewport)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   choose('maps');world_options=page.get_by_label('Large world map',exact=True).locator('option').evaluate_all('(nodes)=>nodes.map(n=>n.value)')
   assert 'firing-range' not in world_options and 'urban-downtown' in world_options
   choose('layout-scenes');reveal('select[aria-label="Activity scene"]').select_option('scene-firing-range')
   reveal('button:has-text("Place activity scene")').click();page.locator('#touch-place-center').click()
   current=scene();module=current['objects'][-1];module_id=module['id'];assert module['modelId']=='scene-firing-range' and current['layout']=='grand-floor'
   choose('layout-scenes')
   for label,value in [('Scene position X (m)','10'),('Scene position Z (m)','4'),('Scene floor offset (m)','0.25'),('Activity scene rotation (degrees)','45'),('Activity scene scale','0.5')]:
    control=reveal('input[aria-label="'+label+'"]');control.fill(value);control.dispatch_event('input');control.dispatch_event('change')
   moved=next(o for o in scene()['objects'] if o['id']==module_id)
   assert moved['position']['x']==10 and moved['position']['z']==4 and moved['scale']['x']==.5 and abs(moved['rotation']['y']-.785398)<.001
   choose('layout-scenes');reveal('input[aria-label="Show activity scenes (editor)"]').uncheck()
   assert not page.evaluate('(id)=>window.MuzikazEnvironmentBuilder.getObject3D(id).visible',module_id)
   choose('camp');reveal('select[aria-label="Camp world size"]').select_option('80');reveal('button:has-text("Generate camp map")').click()
   preserved=next(o for o in scene()['objects'] if o['id']==module_id);assert preserved['position']==moved['position'] and preserved['scale']==moved['scale']
   choose('layout-scenes');reveal('input[aria-label="Show activity scenes (editor)"]').check()
   choose('games');reveal('[data-builder-screen=games] button:has-text("Save draft")').click(no_wait_after=True)
   page.reload();page.wait_for_function('window.MuzikazEnvironmentBuilder')
   preserved=next(o for o in scene()['objects'] if o['id']==module_id);assert preserved['position']==moved['position'] and preserved['scale']==moved['scale']
   choose('games');reveal('[data-builder-screen=games] button:has-text("Test this map")').click(no_wait_after=True);page.wait_for_url('**/__camp_game',timeout=12000)
   assert any(o['id']==module_id and o['scale']['x']==.5 for o in posted[0]['objects']);assert not errors,errors
   print({'viewport':[width,height],'independent_activity_placement_sliders_visibility_save_play':'passed'},flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
