"""Actual mobile airport: header extension owns secondary controls and live dock actions."""
from pathlib import Path
import asyncio,math,os,socket,subprocess,tempfile
from playwright.async_api import async_playwright
os.chdir(Path(__file__).resolve().parents[1])
async def main():
 with socket.socket() as sock:
  sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 with tempfile.TemporaryDirectory(prefix='complete-header-world-') as directory:
  with open(Path(directory,'server.log'),'w') as log:
   server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
   try:
    async with async_playwright() as p:
     browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader'])
     context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block',reduced_motion='reduce')
     base=f'http://127.0.0.1:{port}'
     for _ in range(120):
      try:
       if (await context.request.get(base+'/api/health',timeout=1000)).ok:break
      except Exception:await asyncio.sleep(.2)
     else:raise AssertionError(Path(directory,'server.log').read_text()[-2000:])
     assert (await context.request.post(base+'/api/access/guest',data={})).status==201
     page=await context.new_page();page.set_default_timeout(30000)
     errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
     await page.route('https://**/*',lambda route:route.abort())
     await page.add_init_script("window.MUZIKAZ_AUDIO_SESSION_OVERRIDES={masterMuted:true,effectsMuted:true,announcementsMuted:true,effectsVolume:0,dialogueMuted:true,mediaMuted:true};")
     await page.goto(base+'/model-explorer.html?environment=muzikaz-airport&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
     await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady&&MuzikazHouseExplorer.snapshot().serverReady',timeout=180000)
     print('airport: actual mobile engine ready',flush=True)
     more=page.get_by_role('button',name='More view controls',exact=True)
     await more.wait_for(state='visible')
     await page.wait_for_function("document.querySelector('.game-dock-actions')?.closest('.game-view-overflow')!==null")
     assert await page.locator('.game-display-flow-views > :not(.game-view-more):not(.game-view-overflow)').count()==0
     audit=await page.evaluate('''async()=>{const {GAME_HEADER_CONTROLS}=await import('/public/js/game-header-controls.js');const stage=document.querySelector('.house-stage');return GAME_HEADER_CONTROLS.filter(item=>['stage','dock'].includes(item.source)).flatMap(item=>[...stage.querySelectorAll(item.selector)].filter(node=>node.parentElement===stage||node.closest('.game-display-flow-views')).map(node=>({id:item.id,inside:!!node.closest('.game-view-overflow')})));}''')
     assert audit and all(item['inside'] for item in audit),audit
     assert any(item['id']=='emergency-response' for item in audit),audit
     assert await page.locator('.mobile-move-pad').is_visible()
     assert await page.locator('.doomsday-guide-chip').count()==0
     async def open_menu():
      if await more.get_attribute('aria-expanded')!='true':await more.click()
     await open_menu()
     emergency=page.get_by_role('button',name='Emergency response flow',exact=True)
     await emergency.scroll_into_view_if_needed();await emergency.click()
     await page.wait_for_function("document.querySelector('.doomsday-game-flow details').open")
     assert await page.locator('[data-flow-step=impacts]').is_visible()
     assert await page.locator('[data-flow-step=recovery]').is_visible()
     print('airport: complete catalog and named emergency flow entry are inside the header extension',flush=True)
     # Existing handlers must still open their actual world and settings screens.
     for selector,expected in [('#house-world-button',None),('#house-view-options','Settings & Explorer options')]:
      await open_menu();await page.locator(selector).scroll_into_view_if_needed();await page.locator(selector).click()
      dialog=page.locator('dialog[open]').last if expected is None else page.locator('dialog[open][aria-label="'+expected+'"]')
      await dialog.wait_for(state='visible')
      await dialog.locator('.game-fullscreen-close').click()
      await dialog.wait_for(state='hidden')
     print('airport: original World and Settings handlers open and close their real dialogs',flush=True)
     if await more.get_attribute('aria-expanded')=='true':await more.click()
     before=await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
     await page.keyboard.down('s');await page.wait_for_timeout(1100);await page.keyboard.up('s')
     after=await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
     assert math.hypot(after[0]-before[0],after[2]-before[2])>.15,(before,after)
     assert not (await page.evaluate('MuzikazHouseExplorer.snapshot().player.inputBlocked'))
     assert await page.locator('.game-view-overflow').is_hidden()
     assert not errors,errors
     await page.screenshot(path='/workspace/header-controls-world-mobile.png')
     print('airport: closed header preserves movement and hides secondary controls with no page errors',flush=True)
     await browser.close()
   finally:server.terminate();server.wait(timeout=15)
asyncio.run(main())
