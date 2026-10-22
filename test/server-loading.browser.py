"""Cold server join, graphics loss/recovery and in-page map transitions."""
import os,socket,subprocess,tempfile,time
from pathlib import Path
from playwright.sync_api import sync_playwright
os.chdir(Path(__file__).resolve().parents[1])
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='server-loading-') as directory:
 with open(Path(directory)/'server.log','w') as log:
  server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block',reduced_motion='reduce');base=f'http://127.0.0.1:{port}'
    for _ in range(80):
     try:
      if context.request.get(base+'/api/health',timeout=1000).ok:break
     except Exception:time.sleep(.25)
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda r:r.abort())
    started=time.monotonic();page.goto(base+'/model-explorer.html?environment=pixel-peaks-ski-resort&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted&&window.MuzikazHouseExplorer.snapshot().serverReady',timeout=120000)
    assert page.locator('.house-stage').get_attribute('aria-busy')=='false'
    print('Cold ski resort connected in',round(time.monotonic()-started,1),'seconds',flush=True)
    page.evaluate("window.contextRecovery=document.querySelector('#house-explorer-canvas').getContext('webgl2').getExtension('WEBGL_lose_context');contextRecovery.loseContext()")
    page.wait_for_function('document.querySelector("[data-house-start]").disabled&&document.querySelector("#house-game-load-status").textContent.includes("Graphics paused")',timeout=15000)
    page.evaluate('contextRecovery.restoreContext()')
    page.wait_for_function('!document.querySelector("[data-house-start]").disabled',timeout=30000)
    page.locator('[data-house-start]').click()
    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().gameplayStarted&&window.MuzikazHouseExplorer.snapshot().serverReady',timeout=120000)
    print('Graphics recovery and server reconnect passed',flush=True)
    for destination in ['muzikaz-main','pixel-peaks-ski-resort']:
     page.locator('#house-world-button').click()
     page.locator('[data-world-search]').fill(destination)
     page.locator('[data-world-id="'+destination+'"]').click()
     page.locator('[data-world-join]').click()
     page.wait_for_function('(id)=>{const s=window.MuzikazHouseExplorer.snapshot();return s.roomId===id&&s.serverReady&&s.gameplayStarted&&document.querySelector(".house-stage").getAttribute("aria-busy")==="false"}',arg=destination,timeout=120000)
     print('In-page transition connected:',destination,flush=True)
    assert not errors,errors
    browser.close()
  finally:server.terminate();server.wait(timeout=10)
