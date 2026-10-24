"""The expanded native catalogue remains searchable, actionable and fitted."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass


fixture = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/assets/game-menus.css"><style>
*{box-sizing:border-box}body{margin:0;background:#102018;color:#eff8e9;font:14px system-ui}button,input,select{font:inherit}dialog{color:inherit}button{min-height:44px;cursor:pointer}button:disabled{cursor:default}[hidden]{display:none!important}
</style></head><body><dialog class="game-fullscreen-dialog" aria-label="Build map"><aside id="rad-build-menu" class="rad-build-menu game-fullscreen-content"><h2>Native building catalogue</h2><section data-build-browser></section></aside></dialog><script type="module">
import {mountBuildAssetBrowser} from '/public/js/build-asset-browser.js';
import {GameEconomy} from '/public/js/game-economy-client.js';
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect x="10" y="10" width="60" height="60" rx="8" fill="#baff69"/></svg>');
window.assets=Array.from({length:400},(_,index)=>({id:'native-'+index,buildAssetId:'native-'+index,name:'Native object '+index,category:index%2?'interior':'props',description:'Reusable native object for a detailed game world.',thumbnailUrl:image,behavior:'decor',owned:index%20===0,economySku:'asset:native-'+index,priceMzk:25,useCostMzk:2}));
assets.push({id:'cargo-platform',buildAssetId:'cargo-platform',name:'Cargo Loading Platform',category:'factory',description:'Unload crates on an industrial loading deck.',thumbnailUrl:image,behavior:'decor',owned:true,economySku:'asset:cargo-platform',dimensions:[4.8,.4,2.4],useCostMzk:7,stock:3},{id:'staff-bench',buildAssetId:'staff-bench',name:'Staff Bench',category:'interior',description:'A usable seat for visitors and staff.',thumbnailUrl:image,behavior:'seat',owned:true,economySku:'asset:staff-bench',dimensions:[2.4,1.2,.6],useCostMzk:1},{id:'material:cement',buildAssetId:'material:cement',materialId:'cement',name:'Cement',category:'terrain',description:'Solid basic building material.',thumbnailUrl:image,behavior:'decor',basic:true,owned:true,dimensions:[1.2,.4,.6],useCostMzk:0,stock:0});
const root=document.querySelector('[data-build-browser]');window.actions=[];window.blocked=[];window.tray=[];
window.economy=new GameEconomy({inventory:{},announce:()=>{},shop:sku=>blocked.push(sku)});economy.items=assets.filter(asset=>!asset.materialId).map(asset=>({...asset,kind:'asset',sku:asset.economySku}));economy.install(root);
root.addEventListener('click',event=>{const inventory=event.target.closest('[data-build-asset]'),place=event.target.closest('[data-place-build-asset]');if(inventory)actions.push({action:'inventory',id:inventory.dataset.buildAsset});if(place)actions.push({action:'place',id:place.dataset.placeBuildAsset});});
window.remount=()=>{const previous=window.browser?.state()||{};window.browser?.dispose();window.browser=mountBuildAssetBrowser(root,{assets,tray,previous});economy.decorate();};remount();document.querySelector('dialog').showModal();document.body.dataset.ready='true';
</script></body></html>'''

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  for width, height in [(390, 844), (1280, 900)]:
   page = browser.new_page(viewport={'width':width, 'height':height})
   page.set_default_timeout(8000)
   errors = []
   page.on('pageerror', lambda error: errors.append(str(error)))
   page.route('**/__native_build_browser', lambda route: route.fulfill(body=fixture, content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__native_build_browser')
   page.wait_for_selector('body[data-ready=true]', state='attached')
   page.wait_for_selector('.market-workspace-item')
   assert page.locator('[data-build-row]').count() == 403
   assert '403' in page.locator('[data-build-results]').inner_text()
   assert page.locator('canvas').count() == 0, 'Browsing should not eagerly create hundreds of interactive 3D canvases.'

   search = page.locator('[data-build-search]')
   search.fill('factory unload')
   page.wait_for_function('document.querySelectorAll(".market-workspace-item").length===1')
   selected = page.locator('[data-build-row].is-market-selected')
   assert selected.get_attribute('data-build-id') == 'cargo-platform'
   assert '4.8' in selected.inner_text() and '2.4' in selected.inner_text()
   assert '7' in selected.inner_text() and 'MZK' in selected.inner_text()
   selected.locator('[data-build-asset]').click()
   selected.locator('[data-place-build-asset]').click()
   assert page.evaluate('actions') == [{'action':'inventory','id':'cargo-platform'},{'action':'place','id':'cargo-platform'}]
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == 'asset:cargo-platform'
   # Ownership can expire while the selected preview remains open. The real
   # capture guard must reject a still-enabled Place action before delegation.
   page.evaluate("economy.get('asset:cargo-platform').owned=false")
   selected.locator('[data-place-build-asset]').click()
   assert page.evaluate('blocked') == ['asset:cargo-platform']
   assert len(page.evaluate('actions')) == 2
   page.evaluate("economy.get('asset:cargo-platform').owned=true;blocked=[]")

   ownership = page.locator('[data-build-ownership]')
   ownership.select_option('owned')
   search.fill('cargo')
   page.evaluate('remount()')
   assert page.locator('[data-build-search]').input_value() == 'cargo'
   assert page.locator('[data-build-ownership]').input_value() == 'owned'
   assert page.locator('.is-market-selected').get_attribute('data-build-id') == 'cargo-platform'
   search = page.locator('[data-build-search]')
   search.fill('')
   page.wait_for_function('document.querySelectorAll(".market-workspace-item").length===23')
   assert '23' in page.locator('[data-build-results]').inner_text()

   page.locator('[data-build-ownership]').select_option('all')
   search.fill('Native object 399')
   page.wait_for_function('document.querySelectorAll(".market-workspace-item").length===1')
   locked = page.locator('.is-market-selected')
   assert locked.get_attribute('data-build-id') == 'native-399'
   place = locked.locator('[data-place-build-asset]')
   assert place.count() == 0 or place.is_disabled()
   locked.locator('[data-build-asset]').click()
   assert page.evaluate('blocked') == ['asset:native-399']
   assert len(page.evaluate('actions')) == 2

   search.fill('nothing-in-this-catalogue')
   assert page.locator('[data-build-empty]').is_visible()
   assert page.locator('.market-workspace').is_hidden()
   search.fill('Cement')
   page.wait_for_function('document.querySelector(".is-market-selected")?.dataset.buildId==="material:cement"')
   cement = page.locator('.is-market-selected')
   assert cement.locator('[data-build-asset]').get_attribute('data-economy-sku') == 'material:cement'
   assert cement.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == 'material:cement'
   cement.locator('[data-place-build-asset]').click()
   assert page.evaluate('actions.at(-1)') == {'action':'place','id':'material:cement'}

   layout = page.locator('.market-workspace').evaluate('node=>{const row=node.getBoundingClientRect(),list=node.querySelector(".market-workspace-sidebar").getBoundingClientRect(),detail=node.querySelector(".market-workspace-detail").getBoundingClientRect();return {width:row.width,listRight:list.right,detailLeft:detail.left,inside:row.left>=0&&row.right<=innerWidth+1};}')
   assert layout['inside'] and layout['detailLeft'] >= layout['listRight'], layout
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=f'/tmp/in-game-native-building-browser-{width}.png', full_page=True)
   assert not errors, errors
   page.close()
  browser.close()
 print('Large native building catalogue: mobile/desktop search, ownership, preview selection, actions and state preservation passed.')
finally:
 server.shutdown()
