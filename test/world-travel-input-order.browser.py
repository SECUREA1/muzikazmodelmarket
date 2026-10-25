"""Real map travel recovers when newer input replies overtake its response."""
from pathlib import Path
import asyncio
import os
import socket
import subprocess
import tempfile
from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='world-travel-order-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 700}, has_touch=True, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(80):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    for world in ['public-commons', 'muzikaz-airport', 'world-district-neon-docks']:
                        page = await context.new_page()
                        page.set_default_timeout(30000)
                        errors = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        await page.route('https://**/*', lambda route: route.abort())
                        await page.add_init_script("""(() => {
                            const nativeFetch=window.fetch.bind(window);
                            window.travelRace={armed:false,processed:false,overtaken:false,replies:[],inputs:[],positions:[]};
                            window.fetch=async function(resource,options={}) {
                                const response=await nativeFetch(resource,options);
                                if(!String(resource).includes('/gameplay')||!options.body)return response;
                                const body=JSON.parse(options.body),payload=await response.clone().json(),state=payload.data||{},race=window.travelRace;
                                race.replies.push([body.action,response.status,payload.code,state.sequence]);
                                if(body.action==='map-access'&&race.armed&&response.ok){
                                    race.armed=false;race.sequence=state.sequence;race.epoch=state.inputEpoch||state.result?.inputEpoch;race.processed=true;
                                    await new Promise(resolve=>{race.release=resolve;});
                                    if(race.drop)throw new TypeError('Simulated lost map response');
                                    race.delivered=true;
                                }
                                if(body.action==='input'&&response.ok){
                                    race.inputs.push(body);const self=state.players?.[state.selfId];if(self)race.positions.push(self.position);
                                    if(race.processed&&!race.released&&state.sequence>race.sequence){
                                        const readJSON=response.json.bind(response);
                                        response.json=async()=>{const result=await readJSON();setTimeout(()=>{race.overtaken=true;},0);return result;};
                                    }
                                }
                                return response;
                            };
                        })()""")
                        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)
                        print(world + ': live scene ready for reordered map replies.', flush=True)

                        for drop in [False, True]:
                            await page.evaluate('(drop)=>Object.assign(travelRace,{armed:true,drop,processed:false,overtaken:false,released:false,delivered:false,sequence:null,epoch:null})',drop)
                            await page.locator('.district-map-toggle').click()
                            dialog = page.locator('.district-map-dialog')
                            # Use a real listed map destination. Its asynchronous
                            # command rotates the epoch while the modal is open.
                            await dialog.get_by_role('button', name='Port to ', exact=False, include_hidden=True).first.evaluate('(button)=>{button.closest("details").open=true;}')
                            for attempt in range(3):
                                await page.wait_for_function('MuzikazHouseExplorer.snapshot().serverReady')
                                await dialog.get_by_role('button', name='Port to ', exact=False).first.click()
                                await page.wait_for_function('travelRace.processed||document.querySelector(".local-map-status")?.textContent.includes("Simulated lost map response")')
                                if await page.evaluate('travelRace.processed'):
                                    break
                            assert await page.evaluate('travelRace.processed'), (world,drop,'Map action was not accepted',await page.locator('.local-map-status').inner_text(),await page.evaluate('travelRace.replies.slice(-8)'),await page.locator('.game-live-connection').inner_text())
                            await page.wait_for_function('travelRace.overtaken')
                            assert await page.evaluate('Boolean(travelRace.epoch)'), 'Relocation must assign a new input epoch.'
                            assert await dialog.is_visible(), 'The held travel response must keep its map open.'
                            await page.evaluate('()=>{travelRace.released=true;travelRace.release();}')
                            if drop:
                                await page.wait_for_function('document.querySelector(".local-map-status")?.textContent.includes("Simulated lost map response")')
                            else:
                                await page.wait_for_function('travelRace.delivered')
                            assert await dialog.is_visible(), 'Travel results must not automatically close the map.'
                            await dialog.get_by_role('button', name='Close', exact=True).click()
                            await dialog.wait_for(state='hidden')
                            await page.locator('#house-explorer-canvas').focus()
                            await page.wait_for_timeout(400)
                            await page.evaluate('()=>{travelRace.inputs=[];travelRace.positions=[];}')
                            # A stale epoch permits local prediction for a while,
                            # so assert actual authoritative movement as well.
                            await page.keyboard.down('s')
                            try:
                                await page.wait_for_function('travelRace.inputs.filter(body=>body.input?.forward<-.5).length>=3',timeout=60000,polling=100)
                            except Exception as error:
                                diagnostic=await page.evaluate('''()=>({ready:MuzikazHouseExplorer.snapshot().serverReady,health:MuzikazHouseExplorer.snapshot().health,status:document.querySelector('.game-live-connection')?.textContent,focus:document.activeElement?.tagName+':'+document.activeElement?.className,inputs:travelRace.inputs.slice(-8).map(body=>({forward:body.input?.forward,side:body.input?.side})),replies:travelRace.replies.slice(-12),overlays:[...document.querySelectorAll('dialog[open],#crib-chat-panel:not([hidden]),.world-resident-ui:not([hidden]) .world-resident-panel:not([hidden])')].map(node=>({label:node.getAttribute('aria-label'),className:node.className,hidden:node.hidden,visible:!!node.getClientRects().length}))})''')
                                raise AssertionError((world,drop,'Held movement replies did not resume',diagnostic,errors)) from error
                            await page.keyboard.up('s')
                            await page.wait_for_timeout(250)
                            race=await page.evaluate('travelRace')
                            inputs,server_positions=race['inputs'],race['positions']
                            assert len(inputs) >= 2, (world, drop, 'Input stream stopped after map travel.', await page.evaluate('MuzikazHouseExplorer.snapshot()'), errors, race['replies'][-12:])
                            assert all(body.get('inputEpoch') == race['epoch'] for body in inputs), (world, drop, 'Client remained on an obsolete input epoch.')
                            assert len(server_positions) >= 2, (world, drop, 'No authoritative motion replies.')
                            first, last = server_positions[0], server_positions[-1]
                            distance = ((last['x'] - first['x']) ** 2 + (last['z'] - first['z']) ** 2) ** .5
                            assert distance > .3, (world, drop, 'Authoritative walking froze.', first, last)
                            await page.evaluate('travelRace.positions=[]')
                            await page.keyboard.down('Space')
                            await page.wait_for_function('(floor)=>travelRace.positions.some(position=>position.y>floor+.2)',arg=last['y'],timeout=60000,polling=100)
                            await page.keyboard.up('Space')
                            heights = await page.evaluate('travelRace.positions.map(position=>position.y)')
                            assert heights and max(heights) > last['y']+.2, (world, drop, 'Authoritative jump froze.', heights)
                            assert await page.evaluate('MuzikazHouseExplorer.snapshot().serverReady')
                            print(world + (': lost' if drop else ': delayed') + ' map reply recovered walking and jumping after a newer heartbeat.', flush=True)
                        assert not errors, (world, errors)
                        await page.close()
                    await browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


asyncio.run(main())
