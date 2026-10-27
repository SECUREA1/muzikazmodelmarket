"""Real map discovery, four-stage controls and onward shipping travel."""
import os, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
Path('/workspace/scratch').mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='world-factory-browser-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
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
                    response=context.request.post(base+'/api/access/free-play',data={'username':'FactoryMap'+uuid.uuid4().hex[:8],'password':'test-world-factory-password'})
                    assert response.ok,response.text()
                    worlds=context.request.get(base+'/api/environments').json()['data']
                    world=next(row for row in worlds if row['id']=='world-item-factory')
                    assert world['permanent'] and world['sharedWorld'] and world['worldSupply']['enabled']
                    assert 'hormuz-shipping' in world['portalTargets']
                    print('World registered; opening live factory map.',flush=True)
                    page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                    page.route('https://**/*',lambda route:route.abort())
                    page.goto(base+'/'+world['playUrl'],wait_until='domcontentloaded',timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId === "world-item-factory"',timeout=90000)
                    print('Live map ready; opening production controls.',flush=True)
                    page.screenshot(path='/workspace/scratch/world-item-factory-campus.png')
                    toggle=page.get_by_role('button',name='World item factory',exact=True)
                    if not toggle.is_visible():page.get_by_role('button',name='More view controls',exact=True).click()
                    print('Opening factory board.',flush=True);toggle.click();print('Factory board opened.',flush=True);panel=page.locator('#world-supply-panel');panel.wait_for(state='visible')
                    print('Selecting wood.',flush=True);panel.locator('[data-search]').fill('material:wood')
                    panel.locator('[data-item]').select_option('material:wood')
                    print('Requesting batch price.',flush=True);panel.locator('[data-quantity]').fill('1000');panel.locator('[data-quote]').click()
                    page.wait_for_function('!document.querySelector("[data-produce]").disabled',timeout=15000)
                    panel.locator('.supply-process-diagram').wait_for(state='visible',timeout=15000)
                    assert panel.locator('[data-inspect-stage]').count()==4
                    print('Blueprint inspector ready; funding batch.',flush=True)
                    panel.locator('[data-produce]').click()
                    panel.locator('[data-pause-production]').first.wait_for(state='visible',timeout=15000)
                    expect(panel.locator('[data-pause-production]').first).to_be_enabled(timeout=15000)
                    panel.locator('[data-pause-production]').first.press('Enter')
                    panel.locator('[data-resume-production]').first.wait_for(state='visible',timeout=15000)
                    state=context.request.get(base+'/api/world-supply').json()['data'];job=state['production'][-1]
                    assert job['phase']=='paused' and state['factoryStock'].get('material:wood',0)==0
                    assert len(job['stages'])==4 and all(len(stage['operations'])==3 for stage in job['stages'])
                    print('Pause verified; resuming production.',flush=True)
                    expect(panel.locator('[data-resume-production]').first).to_be_enabled(timeout=15000)
                    panel.locator('[data-resume-production]').first.press('Enter')
                    panel.locator('[data-ready-dispatch]').first.wait_for(state='visible',timeout=45000)
                    panel.locator('[data-inspect-production]').first.click()
                    page.wait_for_function('document.querySelector("[data-inspector]").textContent.includes("1 stock lots")',timeout=15000)
                    assert 'seal' in panel.locator('[data-inspector]').inner_text().lower()
                    panel.locator('[data-inspect-stage="quality"]').click()
                    assert panel.locator('[data-inspector] .supply-operations [data-phase="complete"]').count()==3
                    state=context.request.get(base+'/api/world-supply').json()['data'];assert state['factoryStock']['material:wood']==1000 and state['worldStock']['material:wood']==1000
                    Path('/workspace/scratch').mkdir(exist_ok=True)
                    page.screenshot(path='/workspace/scratch/world-item-factory-production.png',full_page=False)
                    panel.locator('[data-ready-dispatch]').first.click()
                    panel.locator('[data-destination]').select_option('world')
                    panel.locator('[data-dispatch]').click()
                    page.wait_for_function('document.querySelector("[data-shipments]").textContent.includes("World stock")',timeout=15000)
                    state=context.request.get(base+'/api/world-supply').json()['data'];assert state['factoryStock']['material:wood']==0 and state['worldStock']['material:wood']==1000
                    assert state['allocations'][0]['lots'][0]['quantity']==1000
                    print('Packed lot reserved; travelling to shipping.',flush=True)
                    panel.locator('[data-sea-action="travel"]').first.click()
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId === "hormuz-shipping"',timeout=90000)
                    assert not errors,errors
                    print('World Item Factory map, live operations, pause/resume, traced stock and shipping travel passed.')
                finally:browser.close()
        except Exception:
            try:
                page.screenshot(path='/workspace/scratch/world-item-factory-failure.png')
                print(page.locator('[data-inspector]').inner_html()[:1500],page.locator('[data-status]').inner_text(),errors)
            except Exception:pass
            print(Path(directory,'server.log').read_text()[-6000:]);raise
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
