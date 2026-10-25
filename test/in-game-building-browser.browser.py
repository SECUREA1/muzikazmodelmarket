"""Exercise the complete server-backed builder catalog at phone and desktop widths."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json
import os
import re
import subprocess

os.chdir(Path(__file__).resolve().parents[1])
catalog = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import {GAME_ECONOMY} from './game-economy.mjs';
import {createBuildingCatalog} from './public/js/in-game-building-catalog.js';
const economy=GAME_ECONOMY.map(item=>({...item,owned:item.basic===true||item.buildAssetId==='sofa'||item.buildAssetId==='basketball-jersey-home'}));
console.log(JSON.stringify({economy,assets:createBuildingCatalog(economy)}));
"""], text=True))
assert len(catalog['assets']) == 500
house=Path('public/js/house-explorer-glb.js').read_text()
house_css=re.search(r'style.textContent = `([\s\S]+?)`;',house).group(1)
menu_template=re.search(r'buildMenu.innerHTML=`([\s\S]+?)`;',house).group(1)
fixture = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:#09110b;color:#eff8e9;font:14px system-ui}button,input,select{font:inherit}[hidden]{display:none!important}__HOUSE_CSS__
</style><link rel="stylesheet" href="/public/assets/game-menus.css"></head><body><button id="reopen" aria-controls="rad-build-menu">Open builder</button><aside id="rad-build-menu" class="rad-build-menu" aria-label="World Builder" hidden></aside><script type="module">
import {mountBuildAssetBrowser} from '/public/js/build-asset-browser.js';
import {GameEconomy} from '/public/js/game-economy-client.js';
import {fullscreenPanel} from '/public/js/fullscreen-panels.js';
const {assets,economy:records}=await fetch('/__builder_catalog').then(response=>response.json());window.assets=assets;
const panel=document.querySelector('#rad-build-menu');window.actions=[];window.blocked=[];window.tray=[];window.builderCloseCount=0;
window.economy=new GameEconomy({inventory:{},announce:()=>{},shop:sku=>blocked.push(sku)});economy.items=records;economy.install(panel);
panel.addEventListener('click',event=>{const inventory=event.target.closest('[data-build-asset]'),place=event.target.closest('[data-place-build-asset]');if(inventory){const id=inventory.dataset.buildAsset,index=tray.findIndex(item=>item.id===id);if(index<0)tray.push(assets.find(item=>item.id===id));else tray.splice(index,1);actions.push({action:'inventory',id});remount();}if(place)actions.push({action:'place',id:place.dataset.placeBuildAsset});if(event.target.closest('[data-build-market]'))actions.push({action:'shop',tab:'upgrades'});if(event.target.closest('[data-build-bundles]'))actions.push({action:'shop',tab:'bundles'});if(event.target.closest('[data-rad-build-close]'))screenUI.close();const link=event.target.closest('footer a');if(link){event.preventDefault();actions.push({action:'navigate',href:link.getAttribute('href')});}});
window.remount=()=>{const previous=window.browser?.state()||{};window.browser?.dispose();panel.innerHTML=`__MENU_TEMPLATE__`;window.browser=mountBuildAssetBrowser(panel.querySelector('[data-build-browser]'),{assets,tray,previous});economy.decorate();};remount();window.screenUI=fullscreenPanel(panel,{onClose:()=>builderCloseCount++});document.querySelector('#reopen').onclick=()=>screenUI.open();screenUI.open();document.body.dataset.ready='true';
</script></body></html>'''.replace('__HOUSE_CSS__',house_css).replace('__MENU_TEMPLATE__',menu_template)

class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
  for width, height in [(320,740),(768,900),(1280,900),(844,390),(390,844)]:
   touch=width<=390 or height<500
   page = browser.new_page(viewport={'width':width, 'height':height},has_touch=touch,is_mobile=touch,reduced_motion='reduce')
   page.set_default_timeout(10000)
   errors = []
   page.on('pageerror', lambda error: errors.append(str(error)))
   page.route('**/__building_browser', lambda route: route.fulfill(body=fixture, content_type='text/html; charset=utf-8'))
   page.route('**/__builder_catalog', lambda route: route.fulfill(body=json.dumps(catalog), content_type='application/json'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__building_browser')
   try:page.wait_for_selector('body[data-ready=true]', state='attached')
   except Exception:
    print({'startupErrors':errors},flush=True);raise
   page.locator('dialog.builder-catalog-screen[open]').wait_for()
   page.wait_for_function('document.querySelector("[data-in-game-building-catalog-style]")?.sheet')
   def activate(locator):
    locator.scroll_into_view_if_needed()
    if touch:locator.tap()
    else:locator.click()
   def filters(opened=True):
    control=page.locator('[data-build-more-filters]')
    if control.evaluate('(node)=>node.open')!=opened:activate(control.locator(':scope > summary'))
   def details(opened=True):
    control=page.locator('[data-build-item-details]')
    if control.count() and control.evaluate('(node)=>node.open')!=opened:activate(control.locator(':scope > summary'))
   def fits():
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    assert page.locator('dialog').evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
   def target(locator):
    locator.scroll_into_view_if_needed()
    result=locator.evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {width:r.width,height:r.height,left:r.left,right:r.right,hit:hit===node||node.contains(hit)}}''')
    assert result['width']>=43.5 and result['height']>=43.5 and result['left']>=0 and result['right']<=width+1 and result['hit'],(width,height,result)
   assert page.locator('.build-menu-header:visible').count()==1
   assert page.locator('dialog > .game-menu-header').count()==0
   assert page.locator('[data-rad-build-close]:visible').count()==1
   assert page.locator('.game-fullscreen-close:visible').count()==0
   assert page.locator('[data-build-total]').text_content()=='500 items'
   initial=page.locator('[data-build-inspector] [data-build-row]')
   assert initial.locator('[data-place-build-asset]').count()==1
   assert initial.locator('[data-place-build-asset]').text_content().startswith('Unlock to place')
   assert initial.locator('[data-build-asset]').count()==0,'A locked item needs one clear purchase action.'
   assert not page.locator('[data-build-more-filters]').evaluate('(node)=>node.open')
   fits()
   if width==390:
    geometry=page.evaluate('''()=>({header:document.querySelector('.build-menu-header').getBoundingClientRect().height,action:document.querySelector('[data-build-inspector] [data-place-build-asset]').getBoundingClientRect().bottom,cards:document.querySelector('[data-build-card]').getBoundingClientRect().top})''')
    assert geometry['header']<=130 and geometry['action']<=844 and geometry['cards']<=710,geometry
   if touch:assert page.locator('[data-build-search]').evaluate('(node)=>parseFloat(getComputedStyle(node).fontSize)')>=16
   page.screenshot(path=f'/tmp/in-game-building-browser-compact-{width}x{height}.png',full_page=True)
   target(page.locator('[data-rad-build-close]'))
   chips=page.locator('[data-build-quick-category]')
   assert chips.count()>=4
   for category in chips.evaluate_all('(nodes)=>nodes.map(node=>node.dataset.buildQuickCategory)'):
    button=page.locator('[data-build-quick-category="'+category+'"]');activate(button)
    assert button.get_attribute('aria-pressed')=='true'
    assert page.locator('[data-build-category]').input_value()==category
    fits()
   activate(page.locator('[data-build-quick-category=all]'))
   owned_toggle=page.locator('[data-build-owned-toggle]');activate(owned_toggle)
   assert owned_toggle.get_attribute('aria-pressed')=='true'
   assert page.locator('[data-build-ownership]').input_value()=='owned'
   activate(owned_toggle);assert page.locator('[data-build-ownership]').input_value()=='all'
   filters();assert page.locator('[data-build-source]').is_visible()
   filters(False);assert not page.locator('[data-build-source]').is_visible()
   filters()
   if touch:
    for select in page.locator('.build-catalog-toolbar select').all():assert select.evaluate('(node)=>parseFloat(getComputedStyle(node).fontSize)')>=16
   filters(False)
   assert page.locator('[data-build-card]').count() == 12
   assert page.locator('[data-build-results]').inner_text() == '500 of 500 building items'
   assert page.locator('canvas').count() <= 1, 'Catalog browsing should not create hundreds of 3D canvases.'
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   first = page.locator('[data-build-inspector] [data-build-row]').get_attribute('data-build-id')
   page.locator('[data-build-next]').click()
   assert 'Page 2' in page.locator('[data-build-page]').inner_text()
   assert page.locator('[data-build-inspector] [data-build-row]').get_attribute('data-build-id') != first
   state = page.evaluate('window.browser.state()')
   page.evaluate('remount()')
   assert page.evaluate('window.browser.state()') == state
   activate(page.locator('[data-build-previous]'));assert 'Page 1' in page.locator('[data-build-page]').inner_text()
   selected_id=page.locator('[data-build-select]').nth(1).get_attribute('data-build-select')
   activate(page.locator('[data-build-select]').nth(1))
   assert page.locator('[data-build-inspector] [data-build-row]').get_attribute('data-build-id')==selected_id
   assert page.evaluate('actions.length')==0

   page.locator('[data-build-search]').fill('cloud sofa')
   selected = page.locator('[data-build-inspector] [data-build-row]')
   assert selected.get_attribute('data-build-id') == 'sofa'
   details()
   assert 'seat' in selected.inner_text().lower()
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == page.evaluate("economy.skuForAsset(assets.find(item=>item.id==='sofa'))")
   selected.locator('[data-build-asset]').click()
   assert page.evaluate('tray.map(item=>item.id)')==['sofa']
   assert selected.locator('[data-build-asset]').get_attribute('aria-pressed')=='true'
   selected.locator('[data-place-build-asset]').click()
   assert page.evaluate('actions') == [{'action':'inventory','id':'sofa'},{'action':'place','id':'sofa'}]
   # The capture guard checks current ownership again even if the preview still
   # displays an enabled action from an earlier inventory snapshot.
   page.evaluate("window.sofaSku=economy.skuForAsset(assets.find(item=>item.id==='sofa'));economy.get(sofaSku).owned=false")
   selected.locator('[data-place-build-asset]').click()
   assert page.evaluate('blocked') == [page.evaluate('sofaSku')]
   assert len(page.evaluate('actions')) == 2
   page.evaluate("economy.get(sofaSku).owned=true;blocked=[]")
   activate(selected.locator('[data-build-asset]'))
   assert page.evaluate('tray.length')==0
   assert selected.locator('[data-build-asset]').get_attribute('aria-pressed')=='false'
   details();assert 'seat' in selected.text_content().lower()
   details(False);details()
   activate(selected.locator('.market-preview-tuning summary'))
   preview_canvas=selected.locator('canvas[aria-label="Cloud Sofa interactive 3D preview"]')
   preview_canvas.wait_for(timeout=30000);original_preview=preview_canvas.screenshot()
   page.get_by_label('Preview rotation',exact=True).fill('45');rotated_preview=preview_canvas.screenshot()
   assert rotated_preview!=original_preview,'Rotation must change the rendered model.'
   page.get_by_label('Preview zoom',exact=True).fill('1.5')
   assert preview_canvas.screenshot()!=rotated_preview,'Zoom must change the rendered model.'
   assert page.get_by_label('Preview rotation',exact=True).input_value()=='45'
   assert page.get_by_label('Preview zoom',exact=True).input_value()=='1.5'
   activate(selected.locator('.market-preview-tuning summary'))
   filters()
   page.locator('[data-build-function]').select_option('seat')
   page.locator('[data-build-ownership]').select_option('owned')
   state = page.evaluate('window.browser.state()')
   page.evaluate('remount()')
   assert page.evaluate('window.browser.state()') == state
   assert page.locator('[data-build-results]').inner_text() == '1 of 500 building items'

   filters();page.locator('[data-build-reset]').first.click();filters()
   page.locator('[data-build-source]').select_option('glb')
   assert page.locator('[data-build-results]').inner_text() == '55 of 500 building items'
   glb_id = selected.get_attribute('data-build-id')
   assert glb_id.startswith('glb:')
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == page.evaluate('id=>assets.find(item=>item.id===id).economySku',glb_id)
   page.locator('[data-build-ownership]').select_option('locked')
   assert selected.locator('[data-build-asset]').count()==0
   locked_sku=selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku');count=page.evaluate('actions.length')
   activate(selected.locator('[data-place-build-asset]'))
   assert page.evaluate('blocked.at(-1)')==locked_sku and page.evaluate('actions.length')==count
   page.locator('[data-build-ownership]').select_option('all')
   page.locator('[data-build-source]').select_option('tool')
   assert page.locator('[data-build-results]').inner_text() == '24 of 500 building items'
   page.locator('[data-build-search]').fill('laser')
   assert selected.get_attribute('data-build-id') == 'tool:laser'
   assert selected.locator('[data-place-build-asset]').inner_text().startswith('Equip tool')
   assert selected.locator('[data-build-asset]').count() == 0
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == 'tool:laser'
   activate(selected.locator('[data-place-build-asset]'));assert page.evaluate('actions.at(-1).id')=='tool:laser'
   page.locator('[data-build-source]').select_option('all')
   page.locator('[data-build-search]').fill('home basketball jersey')
   assert selected.locator('[data-place-build-asset]').inner_text().startswith('Equip jersey')
   assert selected.locator('[data-build-asset]').count() == 1
   activate(selected.locator('[data-place-build-asset]'));assert page.evaluate('actions.at(-1).id')=='basketball-jersey-home'
   page.locator('[data-build-search]').fill('nothing-in-this-catalogue')
   assert page.locator('[data-build-empty]').is_visible()
   assert page.locator('[data-build-layout]').is_hidden()
   page.locator('[data-build-empty] [data-build-reset]').click()
   filters()
   page.locator('[data-build-category]').select_option('materials')
   page.locator('[data-build-search]').fill('Cement')
   assert selected.get_attribute('data-build-id') == 'material:cement'
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == 'material:cement'
   assert selected.locator('[data-place-build-asset]').is_enabled()
   activate(selected.locator('[data-place-build-asset]'));assert page.evaluate('actions.at(-1).id')=='material:cement'
   activate(page.locator('[data-build-market]'));assert page.evaluate('actions.at(-1)')=={'action':'shop','tab':'upgrades'}
   activate(page.locator('[data-build-bundles]'));assert page.evaluate('actions.at(-1)')=={'action':'shop','tab':'bundles'}
   for link in page.locator('#rad-build-menu footer a').all():
    target(link);href=link.get_attribute('href');activate(link)
    assert page.evaluate('actions.at(-1)')=={'action':'navigate','href':href}
   assert page.locator('.rad-build-launch').get_attribute('href')=='environment-builder.html?from=game'
   assert page.locator('footer a').last.get_attribute('href')=='builder-market.html#backpack'
   fits();target(page.locator('[data-rad-build-close]'));activate(page.locator('[data-rad-build-close]'))
   assert not page.locator('dialog').is_visible() and page.evaluate('builderCloseCount')==1
   activate(page.locator('#reopen'));page.keyboard.press('Escape')
   assert not page.locator('dialog').is_visible() and page.evaluate('builderCloseCount')==2
   activate(page.locator('#reopen'));fits()
   page.screenshot(path=f'/tmp/in-game-building-browser-{width}x{height}.png', full_page=True)
   assert not errors, errors
   print({'viewport':[width,height],'touch':touch,'all_controls':'passed'},flush=True)
   page.close()
  browser.close()
 print('All 500 builder entries: filters, paging, selection, exact SKU guards, tool equipment, state and 320/390/768/1280px layout passed.')
finally:
 server.shutdown()
