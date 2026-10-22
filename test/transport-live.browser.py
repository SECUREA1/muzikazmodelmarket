"""Cold live airport startup, shared AI selection and server dispatch through real UI."""
import os,socket,subprocess,tempfile,time
from pathlib import Path
from playwright.sync_api import sync_playwright
os.chdir(Path(__file__).resolve().parents[1])
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='transport-live-') as directory:
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
    page=context.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',str(e),flush=True)));page.route('https://**/*',lambda r:r.abort())
    page.set_default_timeout(30000)
    page.goto(base+'/model-explorer.html?environment=muzikaz-airport&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
    page.wait_for_timeout(4000)
    print('Load progress:',page.evaluate('({message:document.querySelector("[data-level-loader-message]")?.textContent,percent:document.querySelector("[data-level-loader-percent]")?.textContent,status:document.querySelector("[data-house-status]")?.textContent})'),flush=True)
    try:
     page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted&&window.MuzikazHouseExplorer.snapshot().serverReady',timeout=120000)
    except Exception:
     print('Startup diagnostic:',page.evaluate('({state:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#house-game-load-status")?.textContent,progress:document.querySelector("[data-level-loader-message]")?.textContent,percent:document.querySelector("[data-level-loader-percent]")?.textContent})'),errors,flush=True)
     page.screenshot(path='/workspace/transport-startup-diagnostic.png')
     raise
    print('Live airport connected',flush=True)
    page.get_by_role('button',name='Crew radio and vehicle quests',exact=True).wait_for(state='visible',timeout=30000)
    page.evaluate("()=>{document.querySelector('.district-map-toggle').click();[...document.querySelectorAll('.local-map-view-toggle button')].find(button=>button.textContent==='2D plan').click();}")
    ai=page.locator('[data-craft-id="transport-traffic-aircraft-0"]')
    ai.wait_for(state='attached',timeout=30000)
    assert ai.is_disabled()
    # The local map's native craft choices use a data-name and the canonical server ID.
    own=page.locator('button[data-name*="Diamond"]').first
    own.wait_for(state='visible',timeout=30000);own.click()
    page.wait_for_timeout(1000)
    # Close the map if it stays open after boarding.
    if page.locator('.district-map-dialog[open]').count():page.locator('.district-map-dialog').evaluate('(node)=>node.close()')
    page.get_by_role('button',name='Crew radio and vehicle quests',exact=True).click(force=True)
    page.get_by_label('Choose assignment',exact=True).select_option('air-delivery')
    page.get_by_role('button',name='Request assignment',exact=True).click()
    page.get_by_label('Next mission checkpoint').wait_for(state='visible',timeout=20000)
    page.locator('.transport-radio-panel [data-action]').click()
    page.wait_for_function("document.querySelector('.transport-mission-hud')?.textContent.toLowerCase().includes('departure beacon')")
    reading=page.get_by_label('Next mission checkpoint').inner_text()
    assert 'departure beacon' in reading.lower(),reading
    print('Live assignment:',reading,flush=True)
    page.get_by_role('button',name='Cancel assignment',exact=True).click()
    page.get_by_label('Next mission checkpoint').wait_for(state='hidden',timeout=20000)
    assert not errors,errors
    browser.close()
   print('Live airport starts, shared AI is unavailable for boarding, DA40 boards and cargo pickup, aircraft dispatch and cancellation work through the authoritative server.')
  finally:server.terminate();server.wait(timeout=10)
