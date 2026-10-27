"""Existing local preferences cannot prevent the real upgraded game from starting."""
import json, os, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
keys=['muzikazRadToxHiddenRows','muzikazRadToxBackpack','muzikazActiveBackpackItems','muzikazConsumedBackpackItems','muzikazUnlockedAttachmentLoot']
cases=[('malformed',{**dict.fromkeys(keys,'undefined'),'muzikazDesignatedAvatar':'undefined'}),('old-shapes',{**dict.fromkeys(keys,'{}'),'muzikazRadToxBackpack':'null','muzikazDesignatedAvatar':'[]'})]

with tempfile.TemporaryDirectory(prefix='corrupt-game-storage-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    for name,records in cases:
                        context=browser.new_context(service_workers='block',viewport={'width':800,'height':600})
                        try:
                            for _ in range(100):
                                try:
                                    if context.request.get(base+'/api/health',timeout=1000).ok:break
                                except Exception:time.sleep(.1)
                            else:raise AssertionError(Path(directory,'server.log').read_text()[-3000:])
                            login=context.request.post(base+'/api/access/free-play',data={'username':'Storage'+uuid.uuid4().hex[:10],'password':'corrupt-storage-test-password'})
                            assert login.ok,login.text()
                            page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                            page.route('https://**/*',lambda route:route.abort())
                            # Test the edited source even when a pre-existing dist
                            # directory is present; root also runs the final build.
                            def source_module(route):
                                path=ROOT/unquote(urlparse(route.request.url).path.lstrip('/'))
                                if path.is_file():route.fulfill(path=str(path),content_type='text/javascript')
                                else:route.continue_()
                            page.route('**/public/js/**',source_module)
                            page.add_init_script('for(const [key,value] of Object.entries('+json.dumps(records)+'))localStorage.setItem(key,value);localStorage.setItem("muzikaz.storage-preserved-progress",\'{"saved":42}\');')
                            page.goto(base+'/model-explorer.html?environment=world-item-factory&autoplay=1',wait_until='domcontentloaded',timeout=90000)
                            page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId === "world-item-factory"',timeout=90000)
                            actual=page.evaluate('keys=>Object.fromEntries(keys.map(key=>[key,JSON.parse(localStorage.getItem(key))]))',keys)
                            assert all(isinstance(actual[key],list) for key in keys),actual
                            assert page.evaluate('localStorage.getItem("muzikaz.storage-preserved-progress")')=='{"saved":42}'
                            assert not errors,errors
                            assert 'could not start' not in page.locator('#house-game-load-status').inner_text().lower()
                            print('PASS '+name+': live game started, invalid collections repaired, unrelated progress preserved.',flush=True)
                        finally:context.close()
                finally:browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
