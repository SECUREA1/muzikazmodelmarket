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
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1100,'height':850});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{const {mountDistrictMap}=await import('/public/js/district-map.js'),{neonMarina}=await import('/neon-marina.mjs'),{questCatalog}=await import('/public/js/quest-catalog.js'),{mountPatrolControls}=await import('/public/js/patrol-controls.js');document.body.replaceChildren();document.body.style.margin='0';const stage=document.createElement('main');stage.style.cssText='position:relative;width:100vw;height:100dvh;background:#17382e';document.body.append(stage);const vr=document.createElement('button');vr.textContent='VR';vr.id='test-vr';vr.style.cssText='position:absolute;right:12px;top:12px;width:48px;height:44px';stage.append(vr);const marina=neonMarina(),boat=marina.objects.find(o=>o.modelId==='harbor-patrol');window.world={id:'harbor',name:'Neon Marina',spawn:{x:124,y:0,z:30},builderScene:{mapSize:256,objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};window.commands=[];window.state={serverTime:100000,questOffers:questCatalog(world),players:{p:{id:'p',username:'Skipper',vehicleId:null,ammo:120,position:{x:124,y:0,z:30}}},actors:{[boat.id]:{...boat,id:boat.id,active:true,health:650}},liveDispatch:{id:'incident',title:'Smuggler interdiction',questId:'patrol-raid',expires:190000},questResults:[]};const command=async(action,fields)=>{commands.push({action,...fields});if(action==='map-access'){state.players.p.vehicleId=fields.entityId;state.actors[fields.entityId].holderId='p';}map.updateLive(state,'p');controls.update(state,'p');return {result:{message:'Boarded Sentinel 07.'}};};window.map=mountDistrictMap({stage,fetchAtlas:async()=>({locations:[]}),command});window.controls=mountPatrolControls({stage,command,getAim:()=>({direction:[0,0,-1]})});map.update(world);map.updateLive(state,'p');controls.update(state,'p');}''')
  mini=page.locator('.live-local-map')
  assert mini.is_visible()
  page.wait_for_timeout(300)
  for width,height in [(1100,850),(390,844),(844,390)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(300)
   assert page.evaluate('''()=>{const m=document.querySelector('.live-local-map').getBoundingClientRect(),v=document.querySelector('#test-vr').getBoundingClientRect();return m.top>=v.bottom+11&&m.right<=innerWidth-11&&m.bottom<innerHeight&&m.left>=0}''')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.set_viewport_size({'width':1100,'height':850});page.wait_for_timeout(300)
  assert mini.locator('[data-incident]').is_visible()
  mini.get_by_label('Dismiss dispatch offer',exact=True).click()
  assert not mini.locator('[data-incident]').is_visible()
  mini.get_by_label('Collapse local map',exact=True).click()
  assert not mini.locator('svg').is_visible()
  mini.get_by_label('Expand local map',exact=True).click()
  assert mini.locator('svg').is_visible()
  mini.locator('g[aria-label="Sentinel 07 · Combat Patrol"]').click()
  assert mini.locator('[data-board]').is_enabled()
  mini.locator('[data-board]').click()
  assert page.evaluate("state.players.p.vehicleId==='public-experience-marina-patrol-boat'")
  assert page.get_by_label('Fire patrol cannon',exact=True).is_visible()
  page.get_by_label('Fire patrol cannon',exact=True).click()
  assert page.evaluate("commands.some(c=>c.action==='fire'&&c.direction[2]===-1)")
  old=mini.locator('g[aria-label="Sentinel 07 · Combat Patrol"]').get_attribute('transform')
  page.evaluate("state.actors['public-experience-marina-patrol-boat'].position.z+=20;state.serverTime+=1000")
  page.wait_for_timeout(200);page.evaluate("map.updateLive(state,'p')")
  assert mini.locator('g[aria-label="Sentinel 07 · Combat Patrol"]').get_attribute('transform')!=old
  page.screenshot(path='/workspace/live-patrol-map.png')
  mini.get_by_label('Expand local map and quests',exact=True).click()
  assert page.locator('[data-local-map-plan]').is_visible()
  assert page.get_by_role('button',name='Accept Smuggler interdiction',exact=True).is_enabled()
  assert not errors,errors
  browser.close()
 print('Live top-right flat map, safe HUD spacing in three viewports, collapse/expand, live incidents, actual craft boarding and cannon controls pass.')
finally:server.shutdown()
