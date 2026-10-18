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
   page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?setTimeout(()=>cb(performance.now()),150):raf(cb)")
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
   choose('camp');assert page.get_by_label('Summer camp map',exact=True).locator('option').count()==3
   reveal('select[aria-label="Camp world size"]').select_option('80')
   for layout in ('camp-lakeside','camp-woodland','camp-adventure'):
    choose('camp');reveal('select[aria-label="Summer camp map"]').select_option(layout)
    reveal('button:has-text("Generate camp map")').click()
    current=scene();assert current['layout']==layout and current['mapSize']==80 and len(current['objects'])>40
    board=next(o for o in current['objects'] if o['modelId']=='camp-activity-board');assert len(board['functionalSettings']['quest']['requiredItems'])==2
    assert page.evaluate("()=>{const b=window.MuzikazEnvironmentBuilder;return b.getScene().objects.every(o=>b.getObject3D(o.id)?.children.length>0)}")
   # Small scenes add to the current world; repeated stacks have unique IDs.
   before=scene();original_ids={o['id'] for o in before['objects']}
   for stack in ('campfire-circle','cabin-retreat','adventure-trail'):
    choose('camp-scenes');reveal('select[aria-label="Summer camp scene"]').select_option(stack)
    reveal('button:has-text("Add camp scene")').click()
   current=scene();assert current['layout']==before['layout'] and original_ids.issubset({o['id'] for o in current['objects']})
   assert len(current['objects'])==len(before['objects'])+17
   assert len({o['id'] for o in current['objects']})==len(current['objects'])
   choose('camp');reveal('[data-builder-screen=camp] button:has-text("Browse summer camp items")').click()
   assert page.locator('#library-category').input_value()=='summer-camp'
   assert page.locator('#library-grid [data-model]').count()==16,page.locator('#library-grid [data-model]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.model)')
   ids=page.locator('#library-grid [data-model]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.model)')
   # Every new asset drops immediately; assets can then be tuned in existing controls.
   for model_id in ids:
    choose('items');page.locator('#library-search').fill(model_id)
    reveal('[data-model="'+model_id+'"]').click();page.locator('#touch-place-center').click()
    assert scene()['objects'][-1]['modelId']==model_id
   count=len(scene()['objects'])
   page.locator('#touch-edit').click();page.get_by_label('Object panel screen',exact=True).select_option('rotation')
   reveal('#rotation-exact','#inspector-panel').fill('90');page.locator('#rotation-exact').press('Tab')
   assert abs(scene()['objects'][-1]['rotation']['y']-1.57079632679)<.001
   choose('camp')
   for _ in range(30):
    fits();next_button=page.locator('#library-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True)
    if next_button.is_disabled():break
    next_button.click()
   choose('games');reveal('[data-builder-screen=games] button:has-text("Save draft")').click()
   expected=scene();page.reload();page.wait_for_function('window.MuzikazEnvironmentBuilder')
   assert scene()['layout']==expected['layout'] and len(scene()['objects'])==count
   assert scene()['objects'][-1]['rotation']==expected['objects'][-1]['rotation']
   choose('camp');page.screenshot(path=f'/tmp/muzikaz-summer-camp-{width}.png')
   choose('games');reveal('[data-builder-screen=games] button:has-text("Test this map")').click()
   page.wait_for_url('**/__camp_game',timeout=12000)
   assert len(posted)==1 and posted[0]['layout']=='camp-adventure' and len(posted[0]['objects'])==count
   assert any(o['functionalSettings'].get('quest',{}).get('rewardScore')==35 for o in posted[0]['objects'])
   assert not errors,errors
   print({'viewport':[width,height],'camp_generation_stacks_all_drops_tuning_save_test':'passed'},flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
