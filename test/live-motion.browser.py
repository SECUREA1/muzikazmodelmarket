"""Real shared-room walking under a delayed uplink, without replaying old poses."""
from pathlib import Path
import asyncio, os, socket, subprocess, tempfile, time
from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])

async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='live-motion-') as directory:
        with open(Path(directory)/'server.log','w') as log:
            server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
            try:
                async with async_playwright() as p:
                    browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                    context=await browser.new_context(viewport={'width':640,'height':680},service_workers='block',reduced_motion='reduce')
                    base=f'http://127.0.0.1:{port}'
                    for attempt in range(60):
                        try:
                            if (await context.request.get(base+'/api/health',timeout=1000)).ok: break
                        except Exception: await asyncio.sleep(.2)
                    else: raise AssertionError('Test server did not start.')
                    assert (await context.request.post(base+'/api/access/guest',data={})).status==201
                    page=await context.new_page(); errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    await page.route('https://**/*',lambda route:route.abort())
                    delay={'until':0,'moving':0}
                    async def delayed_input(route):
                        try: body=route.request.post_data_json or {}
                        except Exception: body={}
                        if body.get('action')=='input' and body.get('input',{}).get('forward',0)>.5 and delay['until']:
                            delay['moving']+=1
                            await asyncio.sleep(max(0,delay['until']-time.monotonic()))
                        await route.continue_()
                    await page.route('**/api/rooms/*/gameplay',delayed_input)
                    await page.goto(base+'/model-explorer.html?environment=public-commons&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=60000)
                    await page.wait_for_function("()=>{const s=window.MuzikazHouseExplorer?.snapshot();return s?.serverReady&&s.gameplayStarted&&s.roomId==='public-commons';}",timeout=120000)
                    await page.locator('#house-explorer-canvas').focus()
                    await page.evaluate("""()=>{
                        window.motionTrace=[];window.recordMotion=true;
                        const sample=()=>{if(!recordMotion)return;const s=MuzikazHouseExplorer.snapshot();
                          motionTrace.push({at:performance.now(),position:s.player.position,ready:s.serverReady,shared:s.serverHostedRoom});
                          requestAnimationFrame(sample);};requestAnimationFrame(sample);
                    }""")
                    delay['until']=time.monotonic()+1.05
                    await page.keyboard.down('Shift');await page.keyboard.down('w')
                    await page.wait_for_timeout(3800)
                    held=await page.evaluate('motionTrace.slice()')
                    await page.keyboard.up('w');await page.keyboard.up('Shift')
                    await page.wait_for_timeout(800)
                    await page.evaluate('recordMotion=false')
                    state=await page.evaluate('MuzikazHouseExplorer.snapshot()')
                    assert delay['moving']>=1,'The delayed input path was not exercised.'
                    assert len(held)>5,'The real scene must continue rendering.'
                    assert held[0]['position'][2]-held[-1]['position'][2]>3,'Held controls must make progress.'
                    reversals=[{'before':a,'after':b} for a,b in zip(held,held[1:]) if b['position'][2]-a['position'][2]>.025]
                    assert not reversals,repr(reversals)
                    assert all(s['position'][1]>=-.001 for s in held),'Walking must stay above the physical floor.'
                    assert all(s['shared'] for s in held)
                    assert state['serverReady'] and state['serverHostedRoom'],'The guest session must remain live.'
                    assert not errors,errors
                    await browser.close()
                    print('Live guest walking retains forward progress, physical floor support and shared readiness after a delayed uplink.',flush=True)
            finally:
                server.terminate();server.wait(timeout=15)

asyncio.run(main())
