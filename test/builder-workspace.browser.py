from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os,json
from pathlib import Path
os.chdir(Path(__file__).resolve().parents[1])
artifacts=Path(os.environ.get('BUILDER_TEST_ARTIFACTS','/tmp/muzikaz-builder-previews'))
artifacts.mkdir(parents=True,exist_ok=True)
class H(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),H);Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];bad=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('response',lambda r:bad.append([r.status,r.url]) if r.status>=400 else None)
 page.route('**/api/**',lambda r:r.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]}))
 page.route('https://**/*',lambda r:r.abort())
 page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
 page.wait_for_function("document.querySelectorAll('.library-item').length>50")
 page.locator('#library-search').fill('campfire')
 page.wait_for_function("document.querySelector('[data-model=campfire]') !== null")
 page.locator('[data-catalog-favorite=campfire]').click()
 page.locator('#library-scope').select_option('favorites')
 assert page.locator('.library-item').count()==1
 page.locator('[data-model=campfire]').click()
 page.locator('#touch-place-center').wait_for(state='visible')
 page.wait_for_function("!document.querySelector('#touch-place-center').disabled")
 page.locator('#touch-place-center').click()
 page.wait_for_function("document.querySelector('#object-count').textContent.includes('1 OBJECT')")
 assert page.locator('#inspector-controls').is_visible()
 before=float(page.locator('#position-x').input_value())
 page.locator('[data-tuning-axis=x][data-tuning-sign="1"]').click()
 after=float(page.locator('#position-x').input_value())
 assert abs(after-before-.1)<.02,(before,after)
 page.locator('#rotation-exact').fill('137');page.locator('#rotation-exact').press('Tab')
 assert page.locator('#rotation-control').input_value()=='137'
 page.locator('#scale-exact').fill('175');page.locator('#scale-exact').press('Tab')
 assert page.locator('#scale-control').input_value()=='175'
 page.locator('#tuning-undo').click()
 assert page.locator('#scale-exact').input_value()=='100'
 page.locator('#tuning-redo').click()
 assert page.locator('#scale-exact').input_value()=='175'
 page.locator('#height-exact').fill('0.25');page.locator('#height-exact').press('Tab')
 assert float(page.locator('#elevation-control').input_value())==.25
 page.locator('[data-inspector-tab=look]').click()
 assert not page.locator('#rotation-exact').is_visible()
 assert page.locator('#object-color').is_visible()
 page.locator('[data-inspector-tab=play]').click()
 assert page.locator('#object-behavior').is_visible()
 assert not page.locator('#portal-tuner').is_visible()
 page.locator('[data-inspector-tab=transform]').click()
 page.locator('#library-scope').select_option('recent')
 assert page.locator('.library-item').count()==1
 page.locator('#scene-object-search').fill('no object matches')
 assert page.locator('#scene-search-empty').is_visible()
 page.locator('#scene-object-search').fill('campfire')
 assert page.locator('[data-select-object]').count()==1
 page.locator('#library-clear-filters').click()
 page.locator('#library-sort').select_option('name-desc')
 names=page.locator('.library-item strong').all_text_contents()
 assert names[0].lower()>=names[1].lower()
 page.locator('#land-canvas').scroll_into_view_if_needed()
 page.screenshot(path=str(artifacts/'builder-desktop.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844})
 page.locator('#touch-open-library').click()
 assert page.locator('body').get_attribute('class').find('inspector-open')<0
 page.locator('#library-clear-filters').click()
 page.locator('#library-category').select_option('arcade')
 assert page.locator('.library-item').count()>5, page.locator('#catalog-result-status').inner_text()
 page.locator('[data-library-view=list]').click()
 assert page.locator('#library-panel').get_attribute('data-library-view')=='list'
 page.locator('#library-clear-filters').click()
 page.locator('#library-search').fill('campfire')
 page.screenshot(path=str(artifacts/'builder-mobile-catalogue.png'))
 page.locator('[data-model=campfire]').click()
 page.wait_for_function("!document.querySelector('#touch-place-center').disabled")
 page.locator('#touch-place-center').click()
 page.locator('#touch-edit').click()
 page.locator('#inspector-controls').wait_for(state='visible')
 before=float(page.locator('#height-exact').input_value())
 page.locator('[data-tuning-axis=height][data-tuning-sign="1"]').click()
 assert abs(float(page.locator('#height-exact').input_value())-before-.1)<.001
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'mobile page overflow'
 page.screenshot(path=str(artifacts/'builder-mobile-controls.png'))
 print(json.dumps({'errors':errors,'bad':bad[:10],'checks':['catalogue search/categories/sorting','favourites','recent placements','place in scene','exact transforms','nudges','undo/redo','inspector tabs','scene search','mobile drawers','mobile placement and tuning','no horizontal overflow']}))
 assert not errors, errors
 browser.close()
server.shutdown()
