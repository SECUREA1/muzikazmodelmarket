"""Real docks/airport launch: walk, jump, touch controls and map selection."""
import os,socket,subprocess,tempfile,time
from pathlib import Path
from playwright.sync_api import sync_playwright
os.chdir(Path(__file__).resolve().parents[1])
with socket.socket() as listener:
 listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='transport-startup-') as directory:
 with open(Path(directory)/'server.log','w') as log:
  server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(service_workers='block',viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');base=f'http://127.0.0.1:{port}'
    for _ in range(80):
     try:
      if context.request.get(base+'/api/health',timeout=1000).ok:break
     except Exception:time.sleep(.25)
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    try:
     for world in os.environ.get('MUZIKAZ_TRANSPORT_MAPS','muzikaz-airport,world-district-neon-docks').split(','):
      page=context.new_page();errors=[];inputs=[]
      page.on('pageerror',lambda e:errors.append(str(e)))
      page.on('request',lambda r:inputs.append(r.post_data_json) if '/gameplay' in r.url and r.method=='POST' else None)
      page.route('https://**/*',lambda r:r.abort())
      try:
       page.goto(base+'/model-explorer.html?environment='+world+'&autoplay=1',wait_until='domcontentloaded',timeout=90000)
       page.wait_for_function('''()=>{const state=window.MuzikazHouseExplorer?.snapshot();return state?.gameplayStarted&&state.controlsReady&&state.serverReady&&state.serverPlayerInitialized;}''',timeout=180000)
       print(world,'game ready',flush=True)
       if os.environ.get('MUZIKAZ_PROFILE_TRANSPORT'):
        profiler=context.new_cdp_session(page);profiler.send('Profiler.enable');profiler.send('Profiler.start')
       # Exercise the first real touch before focusing the canvas or opening any
       # panel. An initialized room alone would miss a loading layer swallowing
       # the gesture or a control that only wakes after a separate canvas click.
       assert not page.evaluate('MuzikazHouseExplorer.snapshot().player.inputBlocked')
       stick=page.locator('[data-thumbstick="left"] .thumbstick-base')
       stick.wait_for(state='visible')
       page.wait_for_function('''()=>{const stick=document.querySelector('[data-thumbstick="left"] .thumbstick-base'),r=stick.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===stick||stick.contains(hit);}''',timeout=15000)
       box=stick.bounding_box();center={'id':1,'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
       touch=context.new_cdp_session(page);before=page.evaluate('MuzikazHouseExplorer.snapshot().player.position');touch_inputs=len(inputs)
       touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[center]})
       try:
        touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{**center,'y':center['y']-box['height']*.35}]})
        page.wait_for_function('(a)=>{const b=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(a[0]-b[0],a[2]-b[2])>.15}',arg=before,timeout=20000)
       finally:
        touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});touch.detach()
       assert any(value.get('input',{}).get('forward',0)>.5 for value in inputs[touch_inputs:]),'Initial touch did not reach authoritative movement input.'
       print(world,'initial touch walking passed without canvas focus',flush=True)
       page.locator('#house-explorer-canvas').focus();before=page.evaluate('window.MuzikazHouseExplorer.snapshot().player.position')
       page.keyboard.down('w')
       try:page.wait_for_function('(a)=>{const b=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(a[0]-b[0],a[2]-b[2])>.15}',arg=before,timeout=20000)
       finally:page.keyboard.up('w')
       print(world,'walking passed',flush=True)
       floor=page.evaluate('MuzikazHouseExplorer.snapshot().player.position[1]');page.keyboard.down(' ')
       try:page.wait_for_function('(floor)=>MuzikazHouseExplorer.snapshot().player.position[1]>floor+.1',arg=floor,timeout=15000)
       finally:page.keyboard.up(' ')
       print(world,'keyboard jump passed',flush=True)
       page.wait_for_function('(floor)=>{const p=MuzikazHouseExplorer.snapshot().player;return p.grounded&&p.serverGrounded&&p.position[1]<=floor+.08}',arg=floor,timeout=15000)
       page.evaluate('''() => { window.touchJumpHeights=[];window.recordTouchJump=true;const sample=()=>{if(!recordTouchJump)return;touchJumpHeights.push(MuzikazHouseExplorer.snapshot().player.position[1]);requestAnimationFrame(sample);};requestAnimationFrame(sample); }''')
       page.locator('[data-thumbstick="right"] .thumbstick-base').tap()
       page.wait_for_function('(floor)=>touchJumpHeights.some(y=>y>floor+.1)',arg=floor,timeout=15000)
       page.evaluate('recordTouchJump=false')
       page.locator('.district-map-toggle').click();page.locator('.district-map-dialog').wait_for(state='visible',timeout=15000)
       page.get_by_role('button',name='Vehicles',exact=True).click();assert page.locator('[data-craft-choices] article').count()>0
       page.locator('.district-map-dialog>header button').click()
       assert not errors,errors
       print(world,'fresh multiplayer walking, jumping and vehicle directory passed',flush=True)
      except Exception:
       print('FAIL',world,page.url,errors,'jump commands',[i for i in inputs if i.get('input',{}).get('jump')],'touch',page.evaluate('({maxHeight:Math.max(...window.touchJumpHeights||[])})'),'recent commands',inputs[-5:],flush=True)
       if 'profiler' in locals():
        try:
         import json
         Path('/tmp/transport-browser-profile.json').write_text(json.dumps(profiler.send('Profiler.stop')['profile']))
        except Exception:pass
       print(page.evaluate('({state:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#house-status")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(n=>({name:n.className,hidden:!!n.closest("[hidden]"),rects:n.getClientRects().length}))})'),flush=True)
       page.screenshot(path='/workspace/transport-startup-failure.png');raise
      finally:page.close()
    finally:browser.close()
  finally:server.terminate();server.wait(timeout=10)
