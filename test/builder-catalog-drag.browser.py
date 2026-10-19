"""Real mouse and touchscreen drags, full cards, and Test Map's scene payload."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def copyfile(self,*args):
  try:super().copyfile(*args)
  except (BrokenPipeError,ConnectionResetError):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in (((390,844),) if os.environ.get('BUILDER_DRAG_MOBILE_ONLY') else ((1440,1000),(390,844))):
   context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<=760,service_workers='block')
   page=context.new_page();errors=[];published=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.add_init_script("const originalRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='animate'?setTimeout(()=>callback(performance.now()),150):originalRAF(callback)")
   page.route('https://**/*',lambda r:r.abort())
   def api(route):
    if route.request.url.endswith('/api/health'):
     route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
    elif route.request.url.endswith('/api/market/session'):
     route.fulfill(json={'data':{'account':{'accountId':'test-player','username':'Builder'},'csrfToken':'test-csrf'}})
    elif route.request.url.endswith('/api/custom-maps') and route.request.method=='POST':
     published.append(route.request.post_data_json['scene']);route.fulfill(json={'data':{'playUrl':'/test-builder-launch','name':'Test map'}})
    else: route.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]})
   page.route('**/api/**',api)
   page.route('**/test-builder-launch',lambda r:r.fulfill(body='<h1>Saved map launched</h1>',content_type='text/html'))
   page.goto(base+'/environment-builder.html')
   page.wait_for_function("window.MuzikazEnvironmentBuilder && document.querySelectorAll('.library-item').length>50")
   def catalog(query):
    if width<=760:page.locator('#touch-open-library').click()
    page.get_by_label('Item panel screen',exact=True).select_option('items')
    page.locator('#library-search').fill(query)
    page.wait_for_timeout(150)
   def scene():return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
   def point():
    box=page.locator('#land-canvas canvas').bounding_box()
    return {'x':box['x']+box['width']*.5,'y':box['y']+box['height']*.55}
   def handle_drag(handle,cancel=False):
    # Wait for the opening drawer to finish moving before locating the finger.
    handle.click(trial=True)
    b=handle.bounding_box();start={'x':b['x']+b['width']/2,'y':b['y']+b['height']/2}
    if width<=760:
     cdp=context.new_cdp_session(page)
     cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[start]})
     cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':start['x']+12,'y':start['y']}]})
     page.wait_for_function("document.body.classList.contains('builder-catalog-dragging')")
     dest=point();cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[dest]})
     cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
     cdp.detach()
    else:
     page.mouse.move(**start);page.mouse.down();page.mouse.move(start['x']+12,start['y'],steps=3)
     page.mouse.move(**point(),steps=12)
     if cancel:page.keyboard.press('Escape')
     page.mouse.up()
    page.wait_for_timeout(200)
   catalog('campfire')
   card=page.locator('.catalog-card').filter(has=page.locator('[data-model=campfire]')).first
   assert card.locator('strong').evaluate("n=>getComputedStyle(n).whiteSpace")=='normal'
   handle_drag(card.locator('[data-builder-drag]'))
   assert len(scene()['objects'])==1,(width,scene())
   assert scene()['objects'][0]['modelId']=='campfire'
   assert page.locator('.builder-drag-ghost').count()==0
   catalog('campfire');handle_drag(page.locator('[data-builder-drag=campfire]'),cancel=True)
   assert len(scene()['objects'])==1
   if width<=760:
    # Cancel closed the drawer. Reopen and drag another item.
    catalog('street-sign');handle_drag(page.locator('[data-builder-drag=street-sign]'))
   else:
    catalog('street-sign')
    # Exercise the browser's native HTML drag path as well as the pointer handle.
    page.locator('[data-model=street-sign]').drag_to(page.locator('#land-canvas canvas'),target_position={'x':200,'y':200})
   assert len(scene()['objects'])==2,(width,scene())
   # The building catalogue uses the same handle, including on mobile.
   if width<=760:page.locator('#touch-open-library').click()
   page.get_by_label('Item panel screen',exact=True).select_option('buildings')
   handle=page.locator('#building-kit-grid [data-builder-drag]:visible').first
   for _ in range(15):
    if handle.count():break
    page.locator('#library-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
   building=handle.get_attribute('data-builder-drag')
   page.locator('#builder-auto-furnish').evaluate('n=>n.checked=false')
   handle_drag(handle)
   assert len(scene()['objects'])==3,(width,[o['modelId'] for o in scene()['objects']])
   assert scene()['objects'][-1]['modelId']==building
   expected=scene()
   page.locator('#play-mode').select_option('solo')
   page.locator('#play-scene').click()
   
   try:page.wait_for_url('**/test-builder-launch',timeout=12000)
   except Exception:
    print({'publish_count':len(published),'status':page.locator('#builder-publish-status').inner_text(),'errors':errors,'url':page.url},flush=True);raise
   assert len(published)==1
   actual=published[0]
   assert actual['layout']==expected['layout']
   assert actual['objects']==expected['objects']
   assert actual['gameplay']['multiplayer'] is False
   assert len(actual['placedModels'])==3
   assert not errors,errors
   print({'viewport':[width,height],'drag_and_test_map':'passed'},flush=True)
   context.close()
  browser.close()
finally:server.shutdown()
