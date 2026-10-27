"""Real touch/keyboard walk-up boarding and live hydraulic control, all four machines."""
import json, os, re, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='walkup-browser-') as data:
 with open(Path(data)/'server.log','w') as log:
  server=subprocess.Popen(['node','server.mjs'],stdout=log,stderr=log,env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':data})
  try:
   with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block',reduced_motion='reduce')
    context.add_init_script("Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});Object.defineProperty(Element.prototype,'requestFullscreen',{value:undefined,configurable:true})")
    for _ in range(100):
     try:
      if context.request.get(base+'/api/health',timeout=1000).ok:break
     except Exception:time.sleep(.1)
    assert context.request.post(base+'/api/access/guest',data={}).ok
    page=context.new_page();errors=[];sizes=[];full_sizes=[];control_sizes=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('https://**/*',lambda route:route.abort())
    def command(action,**fields):
     proof=context.request.get(base+'/api/game/room-session').json()['data']['csrfToken']
     response=context.request.post(base+'/api/rooms/skyscraper-construction/gameplay',headers={'X-CSRF-Token':proof},data={'action':action,'requestId':str(uuid.uuid4()),**fields})
     assert response.ok,response.text()
     return response.json()['data']
    def state():return context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']
    def wait(check,label):
     for _ in range(100):
      s=state()
      if check(s):return s
      page.wait_for_timeout(100)
     print('Wait failure diagnostic',json.dumps(page.evaluate('(()=>{const s=MuzikazHouseExplorer.snapshot();return {player:s.player,serverReady:s.serverReady,controlsReady:s.controlsReady,vehicleId:s.vehicleId}})()')),flush=True)
     print('Wait authoritative player',json.dumps(s['players']),flush=True)
     print('Wait authoritative machine',json.dumps(s['actors'].get('construction-dozer')),flush=True)
     raise AssertionError(label)
    def response(res):
     if '/gameplay' in res.url and res.request.method=='POST' and res.ok:
      try:
       action=res.request.post_data_json.get('action')
       if action=='input':sizes.append(len(res.body()))
       elif action=='join':full_sizes.append(len(res.body()))
       elif action=='construction-controls' and res.request.post_data_json.get('operation')=='control':
        assert res.json()['data'].get('constructionControlAck');control_sizes.append(len(res.body()))
      except Exception:pass
    page.on('response',response)
    try:
     page.goto(base+'/model-explorer.html?environment=skyscraper-construction&autoplay=1&mode=multiplayer',wait_until='domcontentloaded')
     page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted&&MuzikazHouseExplorer.snapshot().serverReady',timeout=120000)
     command('construction-crew',operation='pause')
     assert page.locator('.game-viewport-toggle,#house-fullscreen').count()==0
     for index,(machine,field,point) in enumerate([('excavator','boom',{'x':22.1,'z':17}),('crane','hoist',{'x':-12.4,'z':.8}),('truck','bed',{'x':18.2,'z':28}),('dozer','blade',{'x':45.8,'z':61.5})]):
      if os.environ.get('MACHINE') and machine!=os.environ['MACHINE']:continue
      machine_id='construction-'+machine
      command('map-access',position=point)
      page.wait_for_function('p=>{const s=MuzikazHouseExplorer.snapshot();return Math.hypot(s.player.position[0]-p.x,s.player.position[2]-p.z)<1.5}',arg=point)
      # Use real walking input after landing beside the cab. No machine map
      # boarding and no internal render/camera hooks are used.
      page.locator('#house-explorer-canvas').focus()
      page.keyboard.down('a');page.wait_for_timeout(140);page.keyboard.up('a')
      button=page.locator('.builder-nearby-action:not(.builder-portal-action)')
      try:button.wait_for(state='visible',timeout=15000)
      except Exception:
       print('Boarding diagnostic '+machine,json.dumps(page.evaluate('(()=>{const s=MuzikazHouseExplorer.snapshot();return {player:s.player,serverReady:s.serverReady,controlsReady:s.controlsReady,vehicleId:s.vehicleId}})()')),flush=True)
       print('Authoritative player',json.dumps(state()['players']),flush=True)
       page.screenshot(path='/tmp/construction-boarding-failure.png')
       raise
      assert 'Operate' in button.get_attribute('aria-label'),button.get_attribute('aria-label')
      if index<2:button.tap()
      else:page.keyboard.press('f')
      s=wait(lambda s:s['players'][next(iter(s['players']))].get('vehicleId')==machine_id,'walk-up failed for '+machine)
      if index<2:
       page.wait_for_timeout(600);button.dispatch_event('click',{'detail':1})
       page.wait_for_timeout(300)
       assert state()['players'][next(iter(s['players']))].get('vehicleId')==machine_id,'Delayed touch click exited '+machine
      panel=page.locator('.construction-controls');panel.wait_for(state='visible')
      if index==0:
       page.evaluate('window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}));window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}));')
       assert panel.is_visible(),'Cached-page restore disposed the machine dashboard'
      before=s['actors'][machine_id]['construction'][field]
      lever=panel.locator('.construction-work-sticks .construction-stick').last
      lever.focus();page.keyboard.down('ArrowDown');page.wait_for_timeout(450)
      if machine=='excavator':
       assert 'engaged' in panel.locator('.construction-compact-state').inner_text().lower()
       page.screenshot(path='/tmp/excavator-controls-engaged.png')
      page.keyboard.up('ArrowDown')
      s=wait(lambda s:s['actors'][machine_id]['construction'][field]>before+.005,'hydraulic lever did not move '+machine)
      wait(lambda s:all(abs(v)<.001 for v in s['actors'][machine_id]['construction']['axes'].values()),'release did not neutralise '+machine)
      if machine=='truck':
       lever.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(900);page.keyboard.up('ArrowUp')
       wait(lambda s:s['actors'][machine_id]['construction']['bed']<=.08,'body did not lower')
      panel.locator('[data-operation=park]').click()
      if machine!='crane':
       panel.locator('[data-construction-mode=drive]').click()
       travel=panel.locator('.construction-travel-stick');before_position=state()['actors'][machine_id]['position']
       travel.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(1200);page.keyboard.up('ArrowUp')
       wait(lambda s:abs(s['actors'][machine_id].get('driving',{}).get('speed',0))>.02 or ((s['actors'][machine_id]['position']['x']-before_position['x'])**2+(s['actors'][machine_id]['position']['z']-before_position['z'])**2)**.5>.05,'dashboard travel did not engage '+machine)
       panel.locator('[data-operation=park]').click()
       wait(lambda s:abs(s['actors'][machine_id].get('driving',{}).get('speed',0))<.01,'Park did not stop travel '+machine)
       panel.locator('[data-construction-mode=work]').click()
      if machine=='excavator':page.screenshot(path='/tmp/excavator-walkup-controls.png')
      panel.locator('[data-operation=exit]').click()
      wait(lambda s:not s['players'][next(iter(s['players']))].get('vehicleId'),'exit failed '+machine)
      print(machine+': walk-up, '+('touch' if index<2 else 'F key')+', hydraulic control, neutral and exit passed',flush=True)
     if not page.locator('.construction-crew-toggle').is_visible():page.get_by_role('button',name='More view controls',exact=True).click()
     page.get_by_role('button',name='Construction crew and jobs',exact=True).click()
     plan=page.get_by_role('region',name='Site operations plan')
     assert plan.locator('[data-operation-id]').count()==7
     assert '20 cm road base' in plan.inner_text()
     assert plan.locator('[data-operation-id=new-road] progress').evaluate('node=>node.value')==0
     assert plan.locator('[data-operation-id=pavement-reclamation]').is_visible()
     assert not plan.evaluate('node=>node.scrollWidth>node.clientWidth+1'),'Site plan overflows on a phone'
     page.screenshot(path='/tmp/construction-operations-plan.png')
     page.get_by_role('button',name='Close crew',exact=True).click()
     print('Expanded site: seven operations, live road progress and mobile site plan passed',flush=True)
     s=state();worker=s['construction']['crew']['workers'][0];command('map-access',position={'x':worker['position']['x']-1,'z':worker['position']['z']})
     nearby=page.get_by_role('button',name='Talk to Maya Chen',exact=True)
     nearby.wait_for(state='visible',timeout=15000);nearby.tap()
     wait(lambda s:s['players'][next(iter(s['players']))].get('npcConversation',{}).get('contact',{}).get('name')=='Maya Chen','worker conversation did not open')
     if not page.locator('.world-resident-panel').is_visible():page.get_by_role('button',name='Residents, conversations and daily objectives',exact=True).click()
     page.locator('.world-resident-panel').wait_for(state='visible')
     page.screenshot(path='/tmp/construction-people-live.png')
     environments=context.request.get(base+'/api/environments').json()['data']
     assert all('playerCount' in e and 'aiCount' in e for e in environments)
     assert len(sizes)>5 and sorted(sizes)[len(sizes)//2]<100000,sorted(sizes)[-5:]
     assert control_sizes and max(control_sizes)<2000,control_sizes
     assert not errors,errors
     print('Named crew conversations, all-map population metadata and compact input median '+str(sorted(sizes)[len(sizes)//2])+' bytes; full join '+str(full_sizes)+' bytes passed',flush=True)
    except Exception:
     page.screenshot(path='/tmp/machine-walkup-failure.png');Path('/tmp/machine-walkup-failure.json').write_text(json.dumps({'errors':errors,'state':state(),'view':page.evaluate('window.MuzikazHouseExplorer?.snapshot()')},indent=2));raise
    finally:browser.close()
  finally:server.terminate();server.wait(timeout=10)
