"""Actual mobile airport: Radio + More, one emergency card, and original controls."""
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
     # This smoke checks regular controls; real popup timing is a separate opt-in run.
     await page.add_init_script("localStorage.setItem('muzikaz.emergency.panel.automatic','"+('true' if os.environ.get('EXPECT_AUTO_NUCLEAR')=='1' else 'false')+"');")
     await page.goto(base+'/model-explorer.html?environment=muzikaz-airport&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
     await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady&&MuzikazHouseExplorer.snapshot().serverReady',timeout=180000)
     print('airport: actual mobile engine ready',flush=True)
     more=page.get_by_role('button',name='More view controls',exact=True)
     await more.wait_for(state='visible')
     if os.environ.get('EXPECT_AUTO_NUCLEAR')=='1':
      await page.wait_for_function("MuzikazHouseExplorer.snapshot().doomsday?.active",timeout=190000)
      await page.wait_for_function("document.querySelector('.game-view-more')?.getAttribute('aria-expanded')==='false' && !document.querySelector('#emergency-nuclear-panel')?.hidden")
      assert await page.locator('#emergency-nuclear-panel').is_visible()
      assert await page.locator('#emergency-announcement-panel').is_visible()
      assert await page.locator('#emergency-nuclear-panel').evaluate("n=>!!n.closest('.emergency-popup-stack') && !n.closest('.game-view-overflow')")
      assert await page.locator('.emergency-popup-stack').evaluate("n=>{const r=n.getBoundingClientRect(),s=document.querySelector('.house-stage').getBoundingClientRect();return r.left>=s.left&&r.left<s.left+20&&r.top>=s.top+50&&r.top<s.top+80;}")
      assert 'in ' in await page.locator('#emergency-nuclear-panel [data-countdown]').text_content()
      assert await page.locator('#emergency-nuclear-panel [data-countdown]').evaluate("n=>{const r=n.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n.contains(hit);}"),'The actual popup countdown is clipped.'
      await page.screenshot(path='/workspace/automatic-nuclear-world-popup.png')
      await page.get_by_role('button',name='Close emergency radio',exact=True).click()
      await page.wait_for_timeout(1000)
      assert await page.locator('#emergency-radio-popup').is_hidden(),'A dismissed call immediately reopened itself.'
      await page.wait_for_function("MuzikazHouseExplorer.snapshot().doomsday?.phase==='fallout'",timeout=40000)
      assert await more.get_attribute('aria-expanded')=='false','A radio call forced open More.'
      assert await page.locator('#emergency-radio-popup').count()==1
      assert await page.locator('#emergency-radio-popup').is_visible(),'A new fallout announcement did not reopen the one radio card.'
      await page.get_by_role('button',name='Close emergency radio',exact=True).click()
      print('airport: one real countdown/radio card dismisses current calls and reopens for new announcements',flush=True)
     await page.wait_for_function("document.querySelector('.emergency-radio-toggle')?.parentElement.classList.contains('game-display-flow-views') && !!document.querySelector('.emergency-nuclear-toggle')?.closest('.game-view-overflow')")
     assert await page.locator('.game-dock-actions').evaluate("n=>!n.closest('.game-view-overflow') && !!n.closest('.house-control-dock')")
     assert await page.get_by_role('button',name='Emergency radio',exact=True).is_visible()
     assert await page.locator('.emergency-nuclear-toggle').count()==1
     assert await page.locator('.game-display-flow-views > button').count()==2
     assert await more.is_visible()
     assert await page.locator('.mobile-move-pad').is_visible()
     assert await page.locator('.doomsday-guide-chip').count()==0
     async def open_menu():
      if await more.get_attribute('aria-expanded')!='true':await more.click()
     radio_header=page.get_by_role('button',name='Emergency radio',exact=True)
     await radio_header.click();assert await page.locator('#emergency-radio-popup').is_visible()
     await page.locator('#emergency-radio-popup').get_by_text('Radio & sound settings',exact=True).click()
     assert await page.locator('#emergency-sound-panel').is_visible()
     assert await page.get_by_role('button',name='Enable sounds',exact=True).is_visible()
     await radio_header.click();assert await page.locator('#emergency-radio-popup').is_hidden()
     if await more.get_attribute('aria-expanded')=='true':await more.click()
     await open_menu()
     emergency=page.get_by_role('button',name='Emergency response flow',exact=True)
     await emergency.scroll_into_view_if_needed();await emergency.click()
     assert await page.locator('#emergency-radio-popup').is_visible()
     assert await more.get_attribute('aria-expanded')=='false'
     assert await page.locator('#emergency-flow-panel').is_visible()
     if await page.locator('.doomsday-game-flow details').get_attribute('open') is None:
      await page.get_by_text('View full response flow',exact=True).click()
     await page.wait_for_function("document.querySelector('.doomsday-game-flow details').open")
     assert await page.locator('[data-flow-step=impacts]').is_visible()
     assert await page.locator('[data-flow-step=recovery]').is_visible()
     print('airport: Radio + More, one popup with sound and guidance, and original dock controls passed',flush=True)
     await page.get_by_role('button',name='Close emergency radio',exact=True).click()
     # Existing handlers must still open their actual world and settings screens.
     for selector,expected in [('#house-world-button',None),('#house-view-options','Settings & Explorer options')]:
      if await more.get_attribute('aria-expanded')=='true':await more.click()
      await page.locator(selector).scroll_into_view_if_needed();await page.locator(selector).click()
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
     print('airport: regular header and movement remain usable with no page errors',flush=True)
     await browser.close()
   finally:server.terminate();server.wait(timeout=15)
asyncio.run(main())
