"""Public bunker market breakdown and fully rendered editable map copy."""
import json, os, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=30000)
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS=Path('/workspace/scratch');ARTIFACTS.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'

with tempfile.TemporaryDirectory(prefix='bunker-browser-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_STATIC_SOURCE':'repository'},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    context=browser.new_context(service_workers='block',viewport={'width':1280,'height':900})
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError('server startup: '+Path(directory,'server.log').read_text()[-3000:])
                    response=context.request.post(base+'/api/access/free-play',data={'username':'Bunker'+uuid.uuid4().hex[:8],'password':'test-bunker-browser-password'})
                    assert response.ok,response.text()
                    worlds=context.request.get(base+'/api/environments').json()['data']
                    world=next(row for row in worlds if row['id']=='underground-bunker')
                    assert world['permanent'] and world['sharedWorld'] and 'world-item-factory' in world['portalTargets']
                    catalog=context.request.get(base+'/api/market/catalog').json()['data']
                    template=next(row for row in catalog if row.get('worldId')==world['id'] and row.get('source')=='native-map')
                    assert template['itemCount']==len(world['builderScene']['objects']) and all(part.get('sku') for part in template['components'])
                    print('Bunker inventory is complete; checking public builder market and editable copy.',flush=True)
                    errors=[]
                    market=context.new_page();market.set_default_timeout(15000);market.on('pageerror',lambda error:errors.append(str(error)));market.route('https://**/*',lambda route:route.abort())
                    market.goto(base+'/builder-market.html',wait_until='domcontentloaded')
                    market.locator('#builder-native-search').fill('underground bunker')
                    card=market.locator('#builder-native-items article').filter(has=market.get_by_role('heading',name=world['name'],exact=True))
                    expect(card).to_be_visible();card.locator('details').locator('summary').click(no_wait_after=True)
                    assert card.locator('[data-native-open]').count()==len(template['components'])
                    expect(card.get_by_role('link',name='EDIT MAP TEMPLATE',exact=True)).to_have_attribute('href',template['builderUrl'])
                    expect(card.get_by_role('link',name='VISIT MAP',exact=True)).to_have_attribute('href',template['visitUrl'])
                    market.screenshot(path=str(ARTIFACTS/'bunker-builder-market.png'))
                    print('Market component breakdown and template links passed; opening editor.',flush=True)
                    market.goto(base+template['builderUrl'],wait_until='domcontentloaded',timeout=60000)
                    market.wait_for_function('window.MuzikazEnvironmentBuilder?.getScene().sourceEnvironmentId === "underground-bunker"',timeout=90000)
                    market.wait_for_function('window.MuzikazEnvironmentBuilder.getScene().objects.every(o=>window.MuzikazEnvironmentBuilder.getObject3D(o.id)?.userData.builderAssetState === "ready")',timeout=90000)
                    expect(market.locator('#building-cutaway')).to_have_attribute('aria-pressed','true')
                    copied=market.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
                    assert len(copied['objects'])==len(world['builderScene']['objects'])
                    assert copied['sourceLayout']=='underground-bunker'
                    print('All copied editor components ready with default interior cutaway.',flush=True)
                    market.screenshot(path=str(ARTIFACTS/'bunker-editor-template.png'),timeout=15000)
                    assert not errors,errors
                    (ARTIFACTS/'bunker-browser-inspection.json').write_text(json.dumps({'components':template['components'],'copiedObjectCount':len(copied['objects'])},indent=2))
                    print('Bunker public market breakdown and complete native editor copy passed.',flush=True)
                except Exception:
                    try:
                        market.screenshot(path=str(ARTIFACTS/'bunker-browser-failure.png'),timeout=5000)
                        print('Page errors:',errors,flush=True)
                        print('Visible UI:',market.locator('body').inner_text()[-4000:],flush=True)
                    except Exception:pass
                    raise
                finally:browser.close()
        except Exception:
            print(Path(directory,'server.log').read_text()[-6000:]);raise
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
