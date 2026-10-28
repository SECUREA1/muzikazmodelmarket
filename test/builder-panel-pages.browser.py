from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os,json
os.chdir(Path(__file__).resolve().parents[1])
class H(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),H);Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in (((844,390),) if os.environ.get('BUILDER_PANEL_LANDSCAPE_ONLY') else ((1440,900),(390,844),(844,390))):
   page=browser.new_page(viewport={'width':width,'height':height},service_workers='block');errors=[]
   page.add_init_script("window.panelErrors=[];addEventListener('error',e=>window.panelErrors.push([e.message,e.filename,e.lineno,e.colno]))")
   page.on('pageerror',lambda e:errors.append(e.stack))
   page.route('**/api/**',lambda r:r.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]}))
   page.route('https://**/*',lambda r:r.abort())
   # Limit software WebGL rendering; these checks exercise controls, not frame rate.
   page.add_init_script("const originalRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='animate'?setTimeout(()=>callback(performance.now()),1000):originalRAF(callback)")
   page.goto(base+'/environment-builder.html')
   page.wait_for_timeout(1200)
   assert not errors,(errors,page.evaluate('window.panelErrors'))
   page.wait_for_function("document.body.classList.contains('builder-paged-workspace') && document.querySelectorAll('.library-item').length>50")
   if width<=760:page.locator('#touch-open-library').click()
   def check(panel):
    page.wait_for_timeout(80)
    box=page.locator(panel).bounding_box()
    assert 'NULL' not in page.locator(panel).inner_text(), 'no null placeholder labels'
    viewport=page.locator(panel+' .builder-panel-viewport').bounding_box()
    screen=page.locator(panel+' .builder-page-screen:not([hidden])').bounding_box()
    assert screen['height']<=viewport['height']+1,(width,height,panel,page.locator(panel).get_attribute('data-panel-screen'),'content overflow',screen,viewport)
    bad=page.locator(panel).evaluate("""panel=>{const r=panel.getBoundingClientRect();return [...panel.querySelectorAll('button,input,select,textarea,a')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>({id:n.id,text:n.textContent.slice(0,40),r:n.getBoundingClientRect().toJSON()})).filter(n=>n.r.y<r.y-1||n.r.bottom>r.bottom+1)}""")
    assert not bad,(width,height,panel,bad)
    assert page.locator(panel).evaluate('(p)=>getComputedStyle(p).overflowY')=='hidden'
   chooser=page.get_by_label('Item panel screen',exact=True)
   for option in chooser.locator('option').all():
    chooser.select_option(option.get_attribute('value'))
    for _ in range(3 if option.get_attribute('value') in ('items','buildings') else 12):
     check('#library-panel')
     next_button=page.locator('#library-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True)
     if next_button.is_disabled():break
     next_button.click()
    # No need to traverse hundreds of catalogue cards; search validates reachability.
   chooser.select_option('items');page.locator('#library-search').fill('campfire')
   page.locator('[data-model=campfire]').click()
   page.locator('#touch-place-center').click()
   page.locator('#touch-edit').click()
   controls=page.get_by_label('Object panel screen',exact=True)
   for option in controls.locator('option').all():
    if option.is_disabled():continue
    controls.select_option(option.get_attribute('value'))
    for _ in range(12):
     check('#inspector-panel')
     next_button=page.locator('#inspector-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True)
     if next_button.is_disabled():break
     next_button.click()
   for field,value,screen,output in [('rotation-exact','137','rotation','rotation-control'),('scale-exact','175','scale','scale-control'),('height-exact','1.25','position','elevation-control')]:
    controls.select_option(screen)
    while not page.locator('#'+field).is_visible():page.locator('#inspector-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
    page.locator('#'+field).fill(value);page.locator('#'+field).press('Tab')
    assert page.locator('#'+output).input_value()==value
   assert not errors,(errors,page.evaluate('window.panelErrors'))
   print({'viewport':[width,height],'status':'passed'},flush=True)
   page.close()
  browser.close()
 print('Paged panel checks passed: all tested screen controls fit, panel scrolling disabled, catalogue placement and exact tuning remain functional.')
finally:server.shutdown()
