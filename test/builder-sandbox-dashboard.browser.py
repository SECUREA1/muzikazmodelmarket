"""The tool directory covers the real panels and opens working object/gameplay controls."""
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
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<760,service_workers='block');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('https://**/*',lambda r:r.abort())
   page.route('**/api/**',lambda r:r.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]}))
   page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?setTimeout(()=>cb(performance.now()),150):raf(cb)")
   page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
   page.wait_for_function("window.MuzikazEnvironmentBuilder && document.body.classList.contains('builder-gold-workspace')")
   def dashboard():
    if width<760 and page.locator('body').evaluate("n=>n.classList.contains('inspector-open')"):page.locator('.builder-inspector-home').click()
    elif width<760 and page.locator('body').evaluate("n=>n.classList.contains('builder-library-open')"):page.get_by_label('Item panel screen',exact=True).select_option('dashboard')
    else:page.locator('[data-builder-dock=dashboard]').click()
   def scene():return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
   def reveal(selector):
    for _ in range(50):
     if page.locator(selector).is_visible():return page.locator(selector)
     page.locator('#inspector-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
    raise AssertionError(selector)
   dashboard()
   expected=page.get_by_label('Item panel screen',exact=True).locator('option').count()-1+page.get_by_label('Object panel screen',exact=True).locator('option').count()
   assert page.locator('[data-builder-command]').count()==expected, 'Every panel screen needs a directory entry'
   assert '0 OBJECTS' in page.locator('.builder-workspace-overview').text_content()
   search=page.get_by_label('Find a builder tool',exact=True)
   search.fill('CUSTOM FUNCTION')
   command=page.locator('[data-builder-command="inspector:custom-function"]')
   assert command.is_visible() and command.is_disabled(), 'Select an item before editing its behavior'
   search.fill('no-tool-with-this-name')
   assert page.locator('.builder-command-empty').is_visible()
   search.press('Escape');assert search.input_value()=='' and not page.locator('.builder-command-empty').is_visible()
   page.get_by_label('Item panel screen',exact=True).select_option('categories')
   assert page.locator('#library-panel').get_attribute('data-panel-screen')=='categories'
   assert page.evaluate('document.activeElement.id')!='library-search', 'Category navigation must not open a phone keyboard'
   page.get_by_label('Item panel screen',exact=True).select_option('items')
   page.locator('#library-search').fill('Cloud Sofa');page.locator('[data-model=sofa]').click();page.locator('#touch-place-center').click()
   assert len(scene()['objects'])==1
   dashboard();search.fill('ROLE PLAY')
   page.locator('[data-builder-command="inspector:role-play-behavior"]').click()
   assert page.locator('#inspector-panel').get_attribute('data-panel-screen')=='role-play-behavior'
   page.locator('#object-behavior').select_option('quest')
   assert scene()['objects'][0]['functionalSettings']['behavior']=='quest'
   dashboard();search.fill('CUSTOM FUNCTION');command.click()
   reveal('#function-action').select_option('message')
   reveal('#function-value').fill('Welcome to the sandbox')
   assert scene()['objects'][0]['functionalSettings']['value']=='Welcome to the sandbox'
   if width<760:page.locator('#close-inspector').click()
   page.locator('[data-builder-dock=save]').click()
   assert 'saved' in page.locator('#save-state').inner_text().lower()
   if width>=760:
    page.keyboard.press('Control+k')
    assert search.evaluate('(n)=>document.activeElement===n')
   else:dashboard()
   assert '1 OBJECT' in page.locator('.builder-workspace-overview').text_content(), (scene(),page.locator('.builder-workspace-overview').text_content())
   total=page.locator('#library-category option[value=all]').inner_text().split('(')[-1].rstrip(')')
   assert int(total)>50 and f'{total} assets' in page.locator('.builder-workspace-overview').text_content().lower()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   search.fill('')
   page.screenshot(path=f'/tmp/muzikaz-sandbox-{width}.png')
   assert not errors,errors
   print({'viewport':[width,height],'directory_tools':expected,'asset_to_gameplay_setup':'passed'},flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
