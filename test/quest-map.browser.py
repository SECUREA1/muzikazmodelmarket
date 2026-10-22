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
  page.evaluate('''async()=>{const {mountDistrictMap}=await import('/public/js/district-map.js'),{questCatalog}=await import('/public/js/quest-catalog.js'),{neonMarina}=await import('/neon-marina.mjs');document.body.replaceChildren();const stage=document.createElement('main');document.body.append(stage);const marina=neonMarina();window.world={id:'harbor',name:'Neon Marina',builderScene:{mapSize:256,objects:[],layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};window.commands=[];window.state={serverTime:100000,questOffers:questCatalog(world),players:{p:{id:'p',username:'Skipper',vehicleId:'own',position:{x:144,y:0,z:30}}},actors:{own:{id:'own',modelId:'harbor-skiff',position:{x:144,y:0,z:30},active:true}},questResults:[]};window.map=mountDistrictMap({stage,fetchAtlas:async()=>({locations:[]}),command:async(action,fields)=>{commands.push({action,...fields});if(fields.operation==='start'){state.players.p.vehicleMission={questId:fields.questId,instanceId:'demo-quest',title:'Defend the supply convoy',mode:'boat',kind:'defense',status:'active',vehicleId:'own',startedAt:100000,deadline:700000,index:0,cargo:0,kills:0,targetIntegrity:380,checkpoints:[{name:'Protect the relief convoy',x:337,y:0,z:0,actorId:'relief',escort:true,dwell:60,radius:75},{name:'Return to dispatch',x:144,y:0,z:30,action:'check-in',radius:22}],npcIds:['relief','raider']};state.actors.relief={id:'relief',name:'Relief convoy',modelId:'harbor-skiff',health:380,active:true,trafficAI:true,questRole:'protected',position:{x:337,y:0,z:0}};state.actors.raider={id:'raider',name:'Rogue launch',modelId:'harbor-skiff',health:160,active:true,trafficAI:true,questRole:'hostile',position:{x:320,y:0,z:100}};}if(fields.operation==='cancel')state.players.p.vehicleMission.status='cancelled';map.updateLive(state,'p');return {result:{message:'Dispatch confirmed.'}};}});map.update(world);map.updateLive(state,'p');}''')
  page.locator('.district-map-toggle').click()
  page.get_by_role('button',name='2D plan',exact=True).click()
  page.locator('.local-map-quests summary').click()
  page.get_by_label('Quest activity filter').select_option('boat')
  assert page.get_by_role('button',name='Accept Mayday recovery',exact=True).is_enabled()
  assert page.locator('.local-map-quests article').count()==6
  page.get_by_role('button',name='Accept Defend the supply convoy',exact=True).click()
  assert page.evaluate("commands.at(-1).questId==='harbor-defense'")
  assert page.locator('[data-quest-markers] g').count()==3
  page.get_by_label('Show quest markers').uncheck()
  assert page.locator('[data-quest-markers] g').count()==0
  page.get_by_label('Show quest markers').check()
  page.evaluate("state.serverTime+=1000;state.actors.relief.position.z=80;map.updateLive(state,'p')")
  assert '80' in page.locator('[data-quest-markers] g[aria-label^="1. Protect"]').get_attribute('transform')
  page.locator('[data-quest-markers] g[aria-label^="Rogue launch"]').click()
  assert 'Quest opponent' in page.get_by_label('Selected map location').inner_text()
  assert page.get_by_label('Selected map location').locator('button').count()==0
  page.get_by_role('button',name='Interdict nearby launch',exact=True).click()
  assert page.evaluate("commands.at(-1).operation==='interact'")
  page.screenshot(path='/workspace/expanded-quest-map.png')
  for width,height in [(390,844),(844,390)]:
   page.set_viewport_size({'width':width,'height':height})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.get_by_role('button',name='Cancel quest',exact=True).click()
  assert page.locator('[data-quest-markers] g').count()==0
  page.evaluate('map.dispose()')
  assert not errors,errors;browser.close()
 print('Quest map filters, accept/cancel, live convoy and hostile pins, marker toggle, objective information, interdiction and mobile layouts pass.')
finally:server.shutdown()
