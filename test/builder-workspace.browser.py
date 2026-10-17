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
 # Limit software WebGL rendering; these checks exercise controls, not frame rate.
 page.add_init_script("const originalRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='animate'?setTimeout(()=>callback(performance.now()),150):originalRAF(callback)")
 page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
 page.wait_for_function("document.querySelectorAll('.library-item').length>50")
 page.wait_for_function("document.body.classList.contains('builder-paged-workspace')")
 def control(selector):
  target=page.locator(selector)
  if selector in ('#scene-object-search','#library-search','#library-clear-filters') and not target.is_visible():
   page.get_by_label('Object panel screen' if selector=='#scene-object-search' else 'Item panel screen',exact=True).select_option('objects' if selector=='#scene-object-search' else 'items')
  if target.count()==1:
   entry=target.evaluate("n=>n.closest('[data-builder-screen]')?.dataset.builderScreen")
   if entry and not target.is_visible():
    side=target.evaluate("n=>n.closest('aside').id")
    page.get_by_label('Item panel screen' if side=='library-panel' else 'Object panel screen',exact=True).select_option(entry)
    for _ in range(80):
     if target.is_visible():break
     page.locator('#'+side+' .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
  return target

 assert control('#library-panel').bounding_box()['width']>=330
 assert control('#inspector-panel').bounding_box()['width']>=320
 assert abs(control('#library-panel').bounding_box()['width']-control('#inspector-panel').bounding_box()['width'])<2
 assert page.locator('#world-alignment').get_attribute('open') is None
 map_box=control('#land-canvas').bounding_box()
 assert abs(map_box['x']+map_box['width']/2-720)<3, 'map must occupy the centre lane'
 assert control('#library-tile-size').input_value()=='140'
 control('#builder-panel-menu summary').click()
 control('[data-builder-menu=canvas]').click()
 assert page.locator('.environment-workspace').get_attribute('class').find('library-collapsed')>=0
 assert not page.locator('#library-panel').is_visible()
 control('#builder-panel-menu summary').click()
 control('[data-builder-menu=restore]').click()
 for panel in ('library','inspector'):
  page.locator('#expand-'+panel).click()
  assert page.locator('.environment-workspace').get_attribute('data-expanded-panel')==panel
  assert page.locator('#'+('library-panel' if panel=='library' else 'inspector-panel')).bounding_box()['width']>=600
  page.locator('#expand-'+panel).click()
  assert page.locator('.environment-workspace').get_attribute('data-expanded-panel') is None
 control('#library-search').fill('campfire')
 page.wait_for_function("document.querySelector('[data-model=campfire]') !== null")
 control('[data-catalog-favorite=campfire]').click()
 control('#library-scope').select_option('favorites')
 assert page.locator('.library-item').count()==1
 control('[data-model=campfire]').click()
 page.locator('#touch-place-center').wait_for(state='visible')
 page.wait_for_function("!document.querySelector('#touch-place-center').disabled")
 control('#touch-place-center').click()
 page.wait_for_function("document.querySelector('#object-count').textContent.includes('1 OBJECT')")
 assert page.locator('#inspector-panel .builder-panel-viewport').is_visible()
 assert control('#rotation-control').bounding_box()['width']>=240
 assert control('#rotation-exact').bounding_box()['height']>=48
 before=float(control('#position-x').input_value())
 control('[data-tuning-axis=x][data-tuning-sign="1"]').click()
 after=float(control('#position-x').input_value())
 assert abs(after-before-.1)<.02,(before,after)
 control('#rotation-exact').fill('137');control('#rotation-exact').press('Tab')
 assert control('#rotation-control').input_value()=='137'
 control('#scale-exact').fill('175');control('#scale-exact').press('Tab')
 assert control('#scale-control').input_value()=='175'
 control('#tuning-undo').click()
 assert control('#scale-exact').input_value()=='100'
 control('#tuning-redo').click()
 assert control('#scale-exact').input_value()=='175'
 control('#height-exact').fill('0.25');control('#height-exact').press('Tab')
 assert float(control('#elevation-control').input_value())==.25
 original_x=control('#position-x').input_value()
 control('#position-x').fill('')
 control('#position-x').press('Tab')
 assert control('#position-x').input_value()==original_x
 original_count=page.locator('#object-count').inner_text()
 page.evaluate("const text=document.createElement('textarea');text.id='typing-check';document.querySelector('#inspector-panel .builder-page-screen:not([hidden])').prepend(text)")
 control('#typing-check').fill('Edit a message')
 control('#typing-check').press('Backspace')
 assert page.locator('#object-count').inner_text()==original_count
 page.locator('#typing-check').evaluate('(node)=>node.remove()')
 page.get_by_label('Object panel screen',exact=True).select_option('materials')
 assert not page.locator('#rotation-exact').is_visible()
 assert page.locator('#object-color').is_visible()
 page.get_by_label('Object panel screen',exact=True).select_option('role-play-behavior')
 assert page.locator('#object-behavior').is_visible()
 assert not page.locator('#portal-tuner').is_visible()
 page.get_by_label('Object panel screen',exact=True).select_option('move')
 control('#library-scope').select_option('recent')
 assert page.locator('.library-item').count()==1
 control('#scene-object-search').fill('no object matches')
 assert page.locator('#scene-search-empty').is_visible()
 control('#scene-object-search').fill('campfire')
 assert page.locator('[data-select-object]').count()==1
 assert page.evaluate("getComputedStyle(document.querySelector('#scene-list')).maxHeight==='none'")
 control('[data-select-object]').click()
 assert page.locator('#inspector-panel .builder-panel-viewport').is_visible()
 assert page.locator('[data-inspector-tab=transform]').get_attribute('aria-pressed')=='true'
 control('#scene-objects-browse').click()
 assert page.locator('#scene-object-search').is_visible()
 control('#library-clear-filters').click()
 control('#library-sort').select_option('name-desc')
 names=page.locator('.library-item strong').all_text_contents()
 assert names[0].lower()>=names[1].lower()
 page.locator('#land-canvas').scroll_into_view_if_needed()
 page.screenshot(path=str(artifacts/'builder-desktop.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844})
 if 'inspector-open' in page.locator('body').get_attribute('class'):
  control('#close-inspector').click()
 control('[data-workspace-panel=library]').click()
 assert 'builder-library-open' in page.locator('body').get_attribute('class')
 assert page.locator('[data-workspace-panel=inspector]').get_attribute('aria-pressed')=='false'
 control('#expand-library').click()
 assert control('#library-panel').bounding_box()['height']>=840
 control('#expand-library').click()
 page.keyboard.press('Escape')
 assert 'builder-library-open' not in page.locator('body').get_attribute('class')
 control('[data-workspace-panel=library]').click()

 assert page.locator('body').get_attribute('class').find('inspector-open')<0
 control('#library-clear-filters').click()
 control('#library-category').select_option('arcade')
 assert page.locator('.library-item').count()>5, page.locator('#catalog-result-status').inner_text()
 control('[data-library-view=list]').click()
 assert page.locator('#library-panel').get_attribute('data-library-view')=='list'
 control('#library-clear-filters').click()
 control('#library-search').fill('campfire')
 page.screenshot(path=str(artifacts/'builder-mobile-catalogue.png'))
 control('[data-model=campfire]').click()
 page.wait_for_function("!document.querySelector('#touch-place-center').disabled")
 control('#touch-place-center').click()
 control('#touch-edit').click()
 page.locator('#inspector-panel .builder-panel-viewport').wait_for(state='visible')
 control('#expand-inspector').click()
 assert control('#inspector-panel').bounding_box()['height']>=840
 control('#rotation-exact').fill('205')
 control('#rotation-exact').press('Tab')
 assert control('#rotation-control').input_value()=='205'
 control('#tuning-undo').click()
 control('#expand-inspector').click()
 before=float(control('#height-exact').input_value())
 control('[data-tuning-axis=height][data-tuning-sign="1"]').click()
 assert abs(float(control('#height-exact').input_value())-before-.1)<.001
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'mobile page overflow'
 assert control('#inspector-panel').bounding_box()['height']>=.85*844
 assert control('[data-tuning-axis=height][data-tuning-sign=\"1\"]').bounding_box()['height']>=48
 page.screenshot(path=str(artifacts/'builder-mobile-controls.png'))
 page.set_viewport_size({'width':320,'height':740})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'narrow mobile overflow'
 for _ in range(3):
  control('#duplicate-object').click()
 control('#scene-objects-browse').click()
 control('#scene-object-search').fill('')
 assert page.locator('[data-select-object]').count()>=5
 assert page.locator('#inspector-panel').evaluate('(p)=>getComputedStyle(p).overflowY')=='hidden'
 assert page.evaluate("document.querySelector('#scene-list').scrollHeight<=document.querySelector('#scene-list').clientHeight+1")
 control('[data-select-object]:last-child').click()
 assert page.locator('#inspector-panel .builder-panel-viewport').is_visible()
 print(json.dumps({'errors':errors,'bad':bad[:10],'checks':['catalogue search/categories/sorting','favourites','recent placements','place in scene','exact transforms','nudges','undo/redo','inspector tabs','scene search','mobile drawers','mobile placement and tuning','no horizontal overflow']}))
 assert not errors, errors
 browser.close()
server.shutdown()
