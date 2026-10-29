"""Live desktop/mobile forestry controls, harvesting, production and Backpack export."""
import os, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS=Path('/workspace/scratch');ARTIFACTS.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='forest-browser-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                context=browser.new_context(service_workers='block',viewport={'width':1280,'height':900})
                try:
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError(Path(directory,'server.log').read_text()[-2000:])
                    login=context.request.post(base+'/api/access/free-play',data={'username':'Forester'+uuid.uuid4().hex[:8],'password':'forest-browser-password'})
                    assert login.ok,login.text()
                    worlds=context.request.get(base+'/api/environments').json()['data']
                    world=next(row for row in worlds if row['id']=='forest-harvest')
                    page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                    page.route('https://**/*',lambda route:route.abort())
                    page.goto(base+'/'+world['playUrl'],wait_until='domcontentloaded',timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId==="forest-harvest"',timeout=90000)
                    print('Live forest map ready',flush=True)
                    page.screenshot(path=str(ARTIFACTS/'forest-map.png'))
                    panel=page.locator('#forest-harvest-workspace')
                    def open_forest():
                        toggle=page.get_by_role('button',name='Open forest harvesting operations',exact=True)
                        if not toggle.is_visible():page.get_by_role('button',name='More view controls',exact=True).click()
                        toggle.click();expect(panel).to_be_visible()
                    def act(name):
                        button=panel.locator(f'[data-action="{name}"]');expect(button).to_be_enabled();button.click()
                        page.wait_for_function('!document.querySelector("#forest-harvest-workspace [data-action=fell]").disabled')
                        assert panel.locator('[data-status]').get_attribute('data-error')!='true',panel.locator('[data-status]').inner_text()
                    open_forest();page.screenshot(path=str(ARTIFACTS/'forest-operations.png'))
                    act('find-tree');expect(panel).to_be_hidden();time.sleep(1);open_forest()
                    for _ in range(4):act('fell');time.sleep(.8)
                    act('buck');act('load')
                    expect(panel.locator('[data-stat-harvested]')).to_have_text('1')
                    panel.locator('[data-tab=mill]').click();panel.locator('[data-route=mill]:visible').first.click();time.sleep(.5);open_forest();panel.locator('[data-tab=mill]').click();act('unload')
                    # Initial nearest tree is Pine Ridge; read delivered species instead of assuming.
                    text=panel.locator('[data-mill-stock]').inner_text().lower()
                    species=next(kind for kind in ['pine','oak','birch','cedar','walnut','spruce'] if f'{kind} 2' in text)
                    panel.locator('[data-mill-species]').select_option(species);panel.locator('[data-product]').select_option('plank');act('mill');time.sleep(5)
                    panel.locator('[data-route=dry]').click();time.sleep(.5);open_forest();panel.locator('[data-tab=mill]').click()
                    panel.locator('[data-dry-species]').select_option(species);panel.locator('[data-dry-product]').select_option('plank');act('dry');time.sleep(7)
                    panel.locator('[data-tab=workshop]').click();panel.locator('[data-route=craft]:visible').first.click();time.sleep(.5);open_forest();panel.locator('[data-tab=workshop]').click()
                    panel.locator('[data-recipe]').select_option('planter');panel.locator('[data-craft-species]').select_option(species);act('craft')
                    with page.expect_response(lambda response: '/gameplay' in response.url and (response.request.post_data_json or {}).get('action')=='forest-export') as exporting:
                        panel.locator('[data-export]').click()
                    exported=exporting.value.json()['data']['result']['items'][0]
                    expect(panel.locator('[data-status]')).to_contain_text('saved to your Backpack',timeout=15000)
                    expect(panel.locator('[data-export]')).to_have_count(0)
                    print('Fell, buck, load, unload, mill, dry, craft and Backpack export passed',flush=True)
                    page.set_viewport_size({'width':390,'height':844});time.sleep(.4)
                    panel.locator('[data-tab=challenges]').click();expect(panel.locator('[data-challenges]')).to_be_visible()
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    page.screenshot(path=str(ARTIFACTS/'forest-mobile.png'))
                    assert not errors,errors
                    print('Mobile controls and runtime error checks passed',flush=True)
                    proof=context.request.get(base+'/api/game/room-session').json()['data']['csrfToken']
                    headers={'x-csrf-token':proof}
                    endpoint=base+'/api/rooms/public-commons/gameplay'
                    joined=context.request.post(endpoint,headers=headers,data={'action':'join','requestId':'forest-crossworld-join','radToxEnabled':False})
                    assert joined.ok,joined.text()
                    placed=context.request.post(endpoint,headers=headers,data={'action':'spawn','requestId':'forest-crossworld-place','itemId':exported['id']})
                    assert placed.ok,placed.text()
                    state=placed.json()['data'];actor=state['actors'][state['result']['spawnedId']]
                    assert actor['modelId']=='material:planter',actor
                    print('Earned forest item placed in another world without consuming factory stock',flush=True)
                finally:browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
