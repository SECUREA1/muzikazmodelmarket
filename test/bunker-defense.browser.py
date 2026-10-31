"""Bunker shelter collection, editable depth, and live shared alert board."""
import json, os, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=20000)
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS=Path('/workspace/scratch');ARTIFACTS.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='bunker-defense-browser-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_STATIC_SOURCE':'repository'},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                context=browser.new_context(service_workers='block',viewport={'width':1280,'height':900})
                context.set_default_timeout(20000)
                try:
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError('server startup: '+Path(directory,'server.log').read_text()[-3000:])
                    login=context.request.post(base+'/api/access/free-play',data={'username':'Shelter'+uuid.uuid4().hex[:8],'password':'test-bunker-defense-password'})
                    assert login.ok,login.text()
                    worlds=context.request.get(base+'/api/environments').json()['data']
                    world=next(row for row in worlds if row['id']=='underground-bunker')
                    catalog=context.request.get(base+'/api/market/catalog').json()['data']
                    offers=[item for item in catalog if str(item.get('buildAssetId','')).startswith('bunker-') and item.get('sku')]
                    assert len(offers)==24,len(offers)
                    template=next(item for item in catalog if item.get('source')=='native-map' and item.get('worldId')=='underground-bunker')
                    assert all(part.get('sku') for part in template['components'])
                    errors=[]
                    if os.environ.get('BUNKER_BROWSER_SKIP_MARKET')!='1':
                        market=context.new_page();market.on('pageerror',lambda error:errors.append(str(error)));market.route('https://**/*',lambda route:route.abort())
                        market.goto(base+'/builder-market.html?collection=bunker',wait_until='domcontentloaded')
                        collection=market.get_by_role('region',name='Bunker market collection',exact=True)
                        expect(collection).to_be_visible()
                        expect(collection).to_contain_text('24 native items')
                        assert collection.locator('.bunker-market-kits article').count()==3
                        kit_buttons=collection.locator('[data-native-open]')
                        assert kit_buttons.count()==12
                        for item in offers:
                            selected=collection.locator('[data-native-open="'+item['sku']+'"]')
                            if selected.count():expect(selected.first).to_contain_text(f"{item['priceMzk']:,} MZK")
                        expect(market.locator('#builder-native-status')).to_contain_text('25 of')
                        market.screenshot(path=str(ARTIFACTS/'bunker-defense-market.png'),timeout=12000)
                        print('Curated market passed:24 canonical items,3 equipment kits, exact MZK offer prices.',flush=True)
                        market.set_viewport_size({'width':390,'height':844})
                        expect(collection).to_be_visible()
                        assert market.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
                        market.screenshot(path=str(ARTIFACTS/'bunker-defense-market-mobile.png'),timeout=12000)
                        market.set_viewport_size({'width':1280,'height':900})
                        market.goto(base+template['builderUrl'],wait_until='domcontentloaded',timeout=60000)
                        market.wait_for_function('window.MuzikazEnvironmentBuilder?.getScene().sourceEnvironmentId === "underground-bunker"',timeout=45000)
                        market.wait_for_function('window.MuzikazEnvironmentBuilder.getScene().objects.every(o=>window.MuzikazEnvironmentBuilder.getObject3D(o.id)?.userData.builderAssetState === "ready")',timeout=45000)
                        copied=market.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
                        assert len(copied['objects'])==len(world['builderScene']['objects'])
                        assert next(o for o in copied['objects'] if o['id']=='bunker-alert-console')['position']['y'] < -10
                        expect(market.locator('#building-cutaway')).to_have_attribute('aria-pressed','true')
                        market.screenshot(path=str(ARTIFACTS/'bunker-defense-editor.png'),timeout=12000)
                        print('Editor passed:all native components rendered,12m underground equipment retained,cutaway active.',flush=True)
                        market.close()
                        if os.environ.get('BUNKER_BROWSER_EDITOR_ONLY')=='1':raise SystemExit(0)
                    else:copied={'objects':world['builderScene']['objects']}
                    live=context.new_page();live.on('pageerror',lambda error:errors.append(str(error)));live.route('https://**/*',lambda route:route.abort())
                    live.set_viewport_size({'width':980,'height':740})
                    live.goto(base+'/'+world['playUrl'],wait_until='domcontentloaded',timeout=60000)
                    live.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId === "underground-bunker"',timeout=60000)
                    try:
                        live.wait_for_function('window.MuzikazHouseExplorer.snapshot().bunkerDefense?.protection !== undefined',timeout=15000)
                    except Exception:
                        print('LIVE DIAGNOSTIC:',json.dumps(live.evaluate('window.MuzikazHouseExplorer.snapshot()')),flush=True)
                        proof=context.request.get(base+'/api/game/room-session').json()
                        print('ROOM DIAGNOSTIC:',context.request.get(base+'/api/rooms/underground-bunker/gameplay').text()[-6000:],flush=True)
                        raise
                    snapshot=live.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert snapshot['bunkerDefense']['protection']['underground'] is False
                    toggle=live.get_by_role('button',name='Bunker defense and alarms',exact=True)
                    if not toggle.is_visible():
                        more=live.get_by_role('button',name='More view controls',exact=True)
                        if more.is_visible():more.click(no_wait_after=True)
                    expect(toggle).to_be_visible();toggle.dispatch_event('click')
                    panel=live.get_by_role('region',name='Bunker defense status',exact=True)
                    expect(panel).to_be_visible();expect(panel).to_contain_text('Outside underground cover')
                    expect(panel).to_contain_text('Blast cover: Exposed')
                    try:panel.screenshot(path=str(ARTIFACTS/'bunker-defense-surface.png'),timeout=6000)
                    except Exception:print('Surface panel screenshot deferred by software rendering; DOM assertions passed.',flush=True)
                    print('Live surface defense panel rendered with exposed protection status.',flush=True)
                    session=context.request.get(base+'/api/game/room-session').json()['data']
                    result=context.request.post(base+'/api/rooms/underground-bunker/gameplay',headers={'X-CSRF-Token':session['csrfToken']},data={'action':'map-access','position':{'x':0,'y':-11.98,'z':27},'requestId':'bunker-browser-shelter'})
                    assert result.ok,result.text()
                    live.wait_for_function('window.MuzikazHouseExplorer.snapshot().bunkerDefense?.protection.underground === true',timeout=20000)
                    expect(panel).to_contain_text('Underground cover')
                    live.wait_for_function('window.MuzikazHouseExplorer.snapshot().bunkerDefense?.alarm.active === true',timeout=45000)
                    expect(live.get_by_role('button',name='Open bunker alert status',exact=True)).to_be_visible()
                    state=live.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert state['bunkerDefense']['alarm']['kind'] in ['airstrike','nuclear']
                    crew=state['bunkerDefense']['crew'];assert len(crew)==4
                    assert any(actor['resident'].get('bunkerResponse') for actor in crew)
                    try:panel.screenshot(path=str(ARTIFACTS/'bunker-defense-active-alert.png'),timeout=6000)
                    except Exception:print('Alert panel screenshot deferred by software rendering; DOM assertions passed.',flush=True)
                    assert not errors,errors
                    (ARTIFACTS/'bunker-defense-browser.json').write_text(json.dumps({'offers':len(offers),'objectCount':len(copied['objects']),'snapshot':state},indent=2))
                    print('Live underground defense,active alarm banner,and AI crew response passed.',flush=True)
                finally:
                    browser.close()
        except Exception:
            print(Path(directory,'server.log').read_text()[-5000:],flush=True)
            raise
        finally:
            server.terminate()
            try:server.wait(timeout=8)
            except subprocess.TimeoutExpired:server.kill();server.wait()
