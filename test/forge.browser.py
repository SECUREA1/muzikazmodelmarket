"""Live forge discovery, physical stations, metallurgy workflow and Backpack placement."""
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path('/workspace/scratch');ARTIFACTS.mkdir(exist_ok=True)
os.chdir(ROOT)
SEED="""
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('ForgeBrowser','forge-browser-password'),wallet=(await database.ensureAccount(account)).walletId;
await database.transaction(data=>{data.users[wallet].tokens.MZK=5000;return {};});
"""

def data(response):
    assert response.ok,f'{response.status}: {response.text()[:2500]}'
    value=response.json();assert value.get('success') is not False,value
    return value['data']

with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='forge-browser-') as directory:
    subprocess.run(['node','--input-type=module','-',directory],input=SEED,text=True,check=True,capture_output=True)
    with open(Path(directory,'server.log'),'w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_STATIC_SOURCE':os.environ.get('MUZIKAZ_STATIC_SOURCE','repository')},stdout=log,stderr=log)
        page=None
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    context=browser.new_context(service_workers='block',viewport={'width':1280,'height':950},device_scale_factor=.5,reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError(Path(directory,'server.log').read_text()[-3000:])
                    data(context.request.post(base+'/api/access/free-play',data={'username':'ForgeBrowser','password':'forge-browser-password'}))
                    worlds=data(context.request.get(base+'/api/environments'))
                    forge=next(world for world in worlds if world['id']=='traditional-forge')
                    assert forge['permanent'] and forge['sharedWorld'] and forge['forge']['enabled']
                    assert {'world-item-factory','public-commons'}.issubset(forge['portalTargets'])
                    page=context.new_page();page.set_default_timeout(15000);errors=[]
                    page.on('pageerror',lambda error:(errors.append(str(error)),print('Browser error: '+str(error),flush=True)))
                    page.route('https://**/*',lambda route:route.abort())
                    print('Opening '+forge['playUrl'],flush=True)
                    page.goto(base+'/'+forge['playUrl'],wait_until='domcontentloaded',timeout=90000)
                    try:
                        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId==="traditional-forge"',timeout=90000)
                    except Exception:
                        print('Startup diagnostic:',page.evaluate('({state:window.MuzikazHouseExplorer?.snapshot(),body:document.body.innerText.slice(-5000),errors:window.__errors})'),errors,flush=True)
                        page.screenshot(path=str(ARTIFACTS/'forge-startup-failure.png'));raise
                    print('Forge registered; live shared map ready',flush=True)
                    page.screenshot(path=str(ARTIFACTS/'forge-map.png'))
                    panel=page.locator('#forge-workspace')
                    def open_forge():
                        if panel.is_visible():return
                        toggle=page.get_by_role('button',name='Open forge workshop',exact=True)
                        if not toggle.is_visible():page.get_by_role('button',name='More view controls',exact=True).click()
                        toggle.click();expect(panel).to_be_visible()
                        page.wait_for_function('document.querySelector("#forge-workspace [data-work-action]").textContent!=="Working…"')
                    def find_required():
                        panel.locator('[data-find-required]').click();expect(panel).to_be_hidden()
                        time.sleep(.6);open_forge()
                    def act(action):
                        button=panel.locator('[data-work-action]');expect(button).to_be_enabled()
                        with page.expect_response(lambda response:'/gameplay' in response.url and (response.request.post_data_json or {}).get('action')==action) as response:
                            button.click()
                        result=data(response.value)
                        page.wait_for_function('document.querySelector("#forge-workspace [data-work-action]").textContent!=="Working…"')
                        assert panel.locator('[data-status]').get_attribute('data-error')!='true',panel.locator('[data-status]').inner_text()
                        return result
                    open_forge();expect(panel.locator('[data-recipe]')).to_have_count(4)
                    page.screenshot(path=str(ARTIFACTS/'forge-workshop.png'))
                    find_required();started=act('forge-start');job=started['result']['forge']['job']
                    assert started['result']['forge']['balance']==4924
                    find_required();panel.locator('[data-close]').click();expect(panel).to_be_hidden();page.screenshot(path=str(ARTIFACTS/'forge-hearth.png'));open_forge();act('forge-heat')
                    expect(panel.locator('[data-stage-name]')).to_have_text('Shape at the anvil',timeout=15000)
                    find_required()
                    for _ in range(job['requiredStrikes']):
                        act('forge-hammer');time.sleep(.55)
                    expect(panel.locator('[data-stage-name]')).to_have_text('Quench the workpiece')
                    find_required();act('forge-quench')
                    find_required();act('forge-temper')
                    expect(panel.locator('[data-stage-name]')).to_have_text('Finish & collect',timeout=15000)
                    find_required();finished=act('forge-finish');item=finished['result']['item']
                    expect(panel.locator('[data-collected]')).to_be_visible()
                    expect(panel.locator('[data-record]')).to_have_text('1 piece forged')
                    assert item['buildAssetId']=='forge-damascus-blade'
                    assert finished['players'][finished['selfId']]['forge'].get('balance') is None
                    assert all(not event.get('forgeReceipt') and not (event.get('forge') or {}).get('balance') for event in finished['events'])
                    page.screenshot(path=str(ARTIFACTS/'forge-complete.png'))
                    print('Physical stock rack → heat → hammer → quench → temper → Backpack passed',flush=True)
                    page.set_viewport_size({'width':390,'height':844});time.sleep(.5)
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    assert panel.locator('[data-collected]').is_visible()
                    page.screenshot(path=str(ARTIFACTS/'forge-mobile.png'))
                    assert not errors,errors
                    print('Mobile workspace and runtime error checks passed',flush=True)
                    csrf=data(context.request.get(base+'/api/game/room-session'))['csrfToken'];headers={'x-csrf-token':csrf}
                    endpoint=base+'/api/rooms/public-commons/gameplay'
                    data(context.request.post(endpoint,headers=headers,data={'action':'join','requestId':'forge-browser-commons-join','radToxEnabled':False}))
                    deployed=data(context.request.post(endpoint,headers=headers,data={'action':'spawn','requestId':'forge-browser-deploy','itemId':item['id']}))
                    assert deployed['actors'][deployed['result']['spawnedId']]['modelId']=='forge-damascus-blade'
                    print('Crafted Damascus Blade deployed in World Commons through earned Backpack receipt',flush=True)
                    equipped=data(context.request.post(endpoint,headers=headers,data={'action':'interact','requestId':'forge-browser-equip','entityId':deployed['result']['spawnedId']}))
                    swing=data(context.request.post(endpoint,headers=headers,data={'action':'forge-use','requestId':'forge-browser-swing','direction':[0,0,-1]}))
                    assert swing['result']['equipmentId']=='forge-damascus-blade'
                    assert swing['players'][swing['selfId']]['ammo']==equipped['players'][equipped['selfId']]['ammo']
                    print('Owned forged blade picked up and swung without consuming gun ammo',flush=True)
                    page.goto(base+'/model-explorer.html?environment=public-commons&house=public-commons&mode=multiplayer&autoplay=1',wait_until='domcontentloaded',timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId==="public-commons"',timeout=90000)
                    trigger=page.get_by_role('button',name='Fire selected weapon',exact=True);expect(trigger).to_be_visible()
                    with page.expect_response(lambda response:'/gameplay' in response.url and (response.request.post_data_json or {}).get('action') in ('forge-use','fire')) as fired:
                        trigger.click()
                    actual=fired.value.request.post_data_json;used=data(fired.value)
                    assert actual['action']=='forge-use',actual
                    assert used['result']['equipmentId']=='forge-damascus-blade'
                    assert used['players'][used['selfId']]['ammo']==equipped['players'][equipped['selfId']]['ammo']
                    assert not errors,errors
                    print('Visible game fire control uses the held forged blade instead of a gun shot',flush=True)

                except Exception:
                    if page is not None:
                        try:
                            print('Browser diagnostic:',page.evaluate('({state:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#forge-workspace [data-status]")?.textContent})'),errors,flush=True)
                            page.screenshot(path=str(ARTIFACTS/'forge-failure.png'))
                        except Exception:pass
                    raise
                finally:browser.close()
        except Exception:
            if page is not None:
                try:
                    page.screenshot(path=str(ARTIFACTS/'forge-failure.png'))
                    print(page.locator('[data-status]').all_text_contents(),errors,flush=True)
                    print(page.evaluate('window.MuzikazHouseExplorer?.snapshot()'),flush=True)
                except Exception:pass
            print(Path(directory,'server.log').read_text()[-6000:],flush=True);raise
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
