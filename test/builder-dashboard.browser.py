"""Use the mobile dashboard to choose categories, configure a map and place an arcade."""
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
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<=760,service_workers='block');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('https://**/*',lambda r:r.abort())
   page.route('**/api/**',lambda r:r.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]}))
   page.add_init_script("const originalRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='animate'?setTimeout(()=>callback(performance.now()),150):originalRAF(callback)")
   page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
   page.wait_for_function("window.MuzikazEnvironmentBuilder && document.body.classList.contains('builder-paged-workspace')")
   if width<=760:
    page.locator('#touch-open-library').click()
    assert page.locator('#library-panel').get_attribute('data-panel-screen')=='dashboard'
    assert page.evaluate('document.activeElement.id')!='library-search'
   chooser=page.get_by_label('Item panel screen',exact=True)
   def reveal(selector):
    target=page.locator(selector)
    for _ in range(50):
     if target.is_visible():return target
     page.locator('#library-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
    raise AssertionError('Unreachable dashboard control: '+selector)
   chooser.select_option('maps')
   assert chooser.locator('optgroup[label="Map & gameplay"] option[value=maps]').count()==1
   assert 'large world maps & weather' in page.locator('#library-panel .builder-screen-hint').inner_text().lower()
   page.get_by_label('Large world map',exact=True).select_option('loft')
   assert page.locator('#layout-select').input_value()=='loft'
   reveal('.builder-dashboard-field:has(select[aria-label="Map weather"]) select').select_option('cloudy')
   assert page.locator('#weather-select').input_value()=='cloudy'
   # Both map layers are reachable through the same paged tuner on desktop and touch.
   for screen,prefix,label,field in [('world','baseTransform','World X (m)','#world-base-x'),('scene','sceneAlignment','Scene X (m)','#scene-layer-x')]:
    chooser.select_option(screen)
    reveal('input[aria-label="'+label+'"]').fill('6')
    page.get_by_label(label,exact=True).press('Tab')
    assert page.locator(field).input_value()=='6'
    assert page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')[prefix]['x']==6
    reset='Reset world alignment' if screen=='world' else 'Reset scene alignment'
    reveal('.builder-dashboard-action:has-text("'+reset+'")').click()
    assert page.locator(field).input_value()=='0'
   chooser.select_option('world')
   assert page.get_by_label('World X (m)',exact=True).input_value()=='0'
   chooser.select_option('games');page.get_by_label('Game mode',exact=True).select_option('solo')
   assert page.locator('#play-mode').input_value()=='solo'
   chooser.select_option('view');reveal('.builder-dashboard-toggle:has-text("Keep placing") input').check()
   assert page.locator('#repeat-placement').is_checked()
   for category in ('buildings','audio','video','services','seating','backpack','custom','arcade'):
    chooser.select_option('categories')
    reveal('[data-builder-category='+category+']').click()
    assert page.locator('#library-panel').get_attribute('data-panel-screen')=='items'
    assert page.locator('#library-category').input_value()==category
    assert page.locator('#library-scope').input_value()=='all'
    assert page.locator('#library-search').input_value()==''
    assert page.locator('#library-category').is_visible()
   item=page.locator('.library-item:visible').first
   model=item.get_attribute('data-model');item.click()
   page.locator('#touch-place-center').click()
   objects=page.evaluate('window.MuzikazEnvironmentBuilder.getScene().objects')
   assert len(objects)==1 and objects[0]['modelId']==model
   if width<=760:page.locator('#touch-open-library').click()
   before=objects[0]['position']['x']
   chooser.select_option('scene')
   reveal('input[aria-label="Scene X (m)"]').fill('3')
   page.get_by_label('Scene X (m)',exact=True).press('Tab')
   shifted=page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
   assert abs(shifted['objects'][0]['position']['x']-before-3)<0.001
   chooser.select_option('world')
   reveal('input[aria-label="World X (m)"]').fill('5')
   page.get_by_label('World X (m)',exact=True).press('Tab')
   adjusted=page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
   assert adjusted['baseTransform']['x']==5 and adjusted['sceneAlignment']['x']==3
   assert adjusted['objects'][0]['position']['x']==shifted['objects'][0]['position']['x']
   assert not errors,errors
   print({'viewport':[width,height],'dashboard':'passed'},flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
