"""Fresh forge map recovery with a deliberately stale browser native factory."""
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
SEED="""
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('ForgeRecovery','forge-recovery-password');await database.ensureAccount(account);
"""
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='forge-model-recovery-') as directory:
    subprocess.run(['node','--input-type=module','-',directory],input=SEED,text=True,cwd=ROOT,check=True,capture_output=True)
    with open(Path(directory,'server.log'),'w') as log:
        server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_STATIC_SOURCE':'repository'},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    context=browser.new_context(service_workers='block',viewport={'width':1280,'height':900},device_scale_factor=.5,reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError(Path(directory,'server.log').read_text()[-3000:])
                    response=context.request.post(base+'/api/access/free-play',data={'username':'ForgeRecovery','password':'forge-recovery-password'});assert response.ok
                    current=(ROOT/'public/js/builder-models-3d.js').read_text()
                    dispatch='if(FORGE_MODEL_INFO[id])return createForgeModel(id);';assert dispatch in current
                    stale=current.replace(dispatch,"if(String(id).startsWith('forge-'))return null;")
                    served=[]
                    def old_factory(route):
                        served.append(route.request.url);route.fulfill(status=200,content_type='text/javascript',body=stale)
                    context.route('**/public/js/builder-models-3d.js*',old_factory)
                    page=context.new_page();errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.route('https://**/*',lambda route:route.abort())
                    page.goto(base+'/model-explorer.html?environment=traditional-forge&mode=multiplayer&autoplay=1',wait_until='domcontentloaded',timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId==="traditional-forge"',timeout=90000)
                    assert served,'the deliberately old factory was actually served'
                    page.get_by_role('button',name='Open forge workshop',exact=True).click()
                    expect(page.locator('#forge-workspace')).to_be_visible()
                    expect(page.locator('#forge-workspace [data-recipes] button')).to_have_count(10)
                    assert not errors,errors
                    assert 'saved 3D model definition is unavailable' not in page.locator('body').inner_text()
                    page.screenshot(path='/workspace/scratch/forge-model-recovery.png')
                    print('Fresh forge map loaded real stations and 10 recipes with a stale native factory; no browser errors.',flush=True)
                finally:browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
