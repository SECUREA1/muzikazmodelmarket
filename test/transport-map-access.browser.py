from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   for kind in ['airport','marina']:
    page=browser.new_page(viewport={'width':width,'height':height});page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html');page.wait_for_selector('body[data-ready=true]')
    page.evaluate('''async(kind)=>{
      const {mountDistrictMap}=await import('/public/js/district-map.js');
      const {airportWorld}=await import('/airport-world.mjs');const {neonMarina}=await import('/neon-marina.mjs');const port=neonMarina();
      window.world=kind==='airport'?airportWorld():{id:'neon-docks',name:'Neon Docks',builderScene:{layoutMeta:{harbor:port.harbor,locations:port.locations},objects:port.objects}};
      window.commands=[];window.fail=false;window.localMap=mountDistrictMap({stage:document.querySelector('.house-stage'),fetchAtlas:async()=>({locations:[]}),command:async(action,fields)=>{commands.push({action,...fields});return fail?false:{result:{message:'Arrived'}}}});
      localMap.update(world);window.craft=world.builderScene.objects.filter(o=>['corsair-aircraft','harbor-skiff','harbor-sailboat'].includes(o.modelId));
      window.live={players:{alice:{id:'alice',username:'Alice',position:{x:0,y:0,z:0}},bob:{id:'bob',username:'Bob',position:{x:10,y:0,z:10}}},actors:Object.fromEntries(craft.map(o=>[o.id,{...o,active:true}]))};live.actors[craft[1].id].holderId='bob';localMap.updateLive(live,'alice');
    }''',kind)
    opener=page.get_by_role('button',name='Local map and land deeds',exact=True);opener.click();dialog=page.get_by_role('dialog',name='Local map and land deeds')
    assert dialog.locator('[data-live-players] circle').count()==2
    occupied=dialog.get_by_role('button',name='Occupied',exact=True);assert occupied.is_disabled()
    assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
    port=dialog.locator('.district-map-destination').first;port.click();assert not dialog.is_visible()
    assert page.evaluate('commands[0].action')=='map-access'
    assert page.evaluate('commands[0].locationId')==page.evaluate('world.builderScene.layoutMeta.locations[0].id')
    opener.click();board=dialog.get_by_role('button',name='Board ',exact=False).first;board.click();assert not dialog.is_visible()
    assert page.evaluate('commands[1].entityId')==page.evaluate('craft[0].id')
    opener.click();page.evaluate('fail=true');dialog.get_by_role('button',name='Board ',exact=False).first.click();assert dialog.is_visible();assert dialog.get_by_role('status').inner_text().startswith('Travel could not')
    page.evaluate("live.actors[craft[0].id].holderId='alice';localMap.updateLive(live,'alice')");assert dialog.get_by_role('button',name='Occupied',exact=True).count()==2
    assert not errors,errors;page.close()
  browser.close()
 print('Both transport maps: mobile/desktop travel, live players, occupancy, boarding and failed-command handling passed.')
finally:server.shutdown()
