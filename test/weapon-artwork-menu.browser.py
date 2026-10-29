#!/usr/bin/env python3
"""Verify new vectors in the actual game weapon/utility dialogs, including lazy loading."""
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)


def exercise(browser,base,width):
    context=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=.25,
        is_mobile=width<760,has_touch=width<760,service_workers='block',reduced_motion='reduce')
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    page=context.new_page()
    errors,art_requests=[],[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:art_requests.append(request.url) if '/native-designs/tool-' in request.url else None)
    page.route('https://**/*',lambda route:route.abort())
    try:
        print(json.dumps({'width':width,'phase':'loading'}),flush=True)
        page.goto(base+'/model-explorer.html?environment=public-commons&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady&&MuzikazHouseExplorer.snapshot().serverReady',timeout=90000)
        page.locator('dialog[open]').evaluate_all('(dialogs)=>dialogs.forEach(dialog=>dialog.close())')
        print(json.dumps({'width':width,'phase':'ready','artRequests':art_requests}),flush=True)
        startup_requests=list(art_requests)
        # The default quick-tool UI may show the starter laser and paint gun.
        # Other loadout images belong to closed dialogs and must stay lazy.
        assert all(urlsplit(url).path.rsplit('/',1)[-1] in ['tool-laser.svg','tool-spray.svg'] for url in startup_requests),{'width':width,'hiddenWeaponArtworkRequestedAtStartup':startup_requests}
        page.locator('[data-house-tools]').evaluate('(button)=>button.click()')
        page.locator('[data-weapons-category]').evaluate('(button)=>button.click()')
        page.locator('#rad-weapons-popup').wait_for(state='visible')
        print(json.dumps({'width':width,'phase':'weapons-open'}),flush=True)
        expected=page.evaluate("async()=>{const {RANGED_WEAPONS}=await import('/public/js/game-weapons.js');return [...Object.keys(RANGED_WEAPONS),'flamethrower','bat','taser','dynamite','toxin'];}")
        verified=[]
        while True:
            states=page.locator('#rad-weapons-popup [data-rad-tool][data-pie-hidden="false"]').evaluate_all('''async choices=>Promise.all(choices.map(async choice=>{
              const image=choice.querySelector('img.rad-tool-icon');if(!image)throw Error('Missing new weapon image: '+choice.dataset.radTool);
              await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('visible weapon image decode timed out')),15000))]);
              return {tool:choice.dataset.radTool,src:image.getAttribute('src'),width:image.naturalWidth,lazy:image.loading};
            }))''')
            for state in states:
                tool=state['tool'];assert state['src']=='/public/images/native-designs/tool-'+tool+'.svg?art=equipment-vector-v1',(tool,state)
                assert state['width']==320 and state['lazy']=='lazy',(tool,state)
                verified.append(tool)
            print(json.dumps({'width':width,'phase':'weapon-page','verified':verified}),flush=True)
            next_page=page.get_by_role('button',name='Next Weapons page',exact=True)
            if next_page.is_disabled():break
            next_page.click()
        assert sorted(verified)==sorted(expected),(verified,expected)
        previous=page.get_by_role('button',name='Previous Weapons page',exact=True)
        while not previous.is_disabled():previous.click()
        page.locator('#rad-weapons-popup').evaluate('(dialog)=>dialog.scrollTop=0')
        page.screenshot(path=f'/workspace/weapon-menu-upgraded-{width}.png',scale='css')
        assert page.locator('#rad-weapons-popup').evaluate('(dialog)=>dialog.scrollWidth<=dialog.clientWidth+1'),'weapon dialog overflow'
        # The real selection event still equips the owned starter weapon.
        page.locator('#rad-weapons-popup [data-rad-tool="laser"]').evaluate('(button)=>button.click()')
        page.wait_for_function('MuzikazHouseExplorer.snapshot().tool==="laser"&&!document.querySelector("#rad-weapons-popup").open')
        page.locator('[data-house-tools]').evaluate('(button)=>button.click()')
        page.locator('[data-utility-category]').evaluate('(button)=>button.click()')
        page.locator('#rad-utility-popup').wait_for(state='visible')
        utilities=page.evaluate("async()=>{const {UTILITY_TOOLS}=await import('/public/js/game-utilities.js');return Object.keys(UTILITY_TOOLS);}")
        verified_utilities=[]
        while True:
            states=page.locator('#rad-utility-popup [data-utility-tool][data-pie-hidden="false"]').evaluate_all('''async choices=>Promise.all(choices.filter(choice=>!choice.dataset.utilityTool.startsWith('fishing-')).map(async choice=>{
              const image=choice.querySelector('img.rad-tool-icon');if(!image)throw Error('Utility still uses generic art: '+choice.dataset.utilityTool);
              await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('visible utility image decode timed out')),15000))]);
              return {tool:choice.dataset.utilityTool,src:image.getAttribute('src'),width:image.naturalWidth};
            }))''')
            for state in states:
                tool=state['tool'];assert state['src']=='/public/images/native-designs/tool-'+tool+'.svg?art=equipment-vector-v1',(tool,state)
                assert state['width']==320,(tool,state)
                verified_utilities.append(tool)
            print(json.dumps({'width':width,'phase':'utility-page','verified':verified_utilities}),flush=True)
            next_page=page.get_by_role('button',name='Next Utility tools page',exact=True)
            if next_page.is_disabled():break
            next_page.click()
        assert sorted(verified_utilities)==sorted(utilities),(verified_utilities,utilities)
        previous=page.get_by_role('button',name='Previous Utility tools page',exact=True)
        while not previous.is_disabled():previous.click()
        page.locator('#rad-utility-popup').evaluate('(dialog)=>dialog.scrollTop=0')
        page.screenshot(path=f'/workspace/utility-menu-upgraded-{width}.png',scale='css')
        assert not errors,errors
        result={'width':width,'weapons':verified,'utilities':utilities,'startupArtworkRequests':startup_requests,'hiddenWeaponArtworkRequests':0,'uniqueArtworkRequests':len(set(art_requests)),'pageErrors':errors}
        print(json.dumps(result),flush=True)
        return result
    except Exception:
        page.screenshot(path=f'/workspace/weapon-artwork-failure-{width}.png',full_page=True,scale='css')
        print(json.dumps({'width':width,'errors':errors,'artRequests':art_requests,'state':page.evaluate('window.MuzikazHouseExplorer?.snapshot()')}),flush=True)
        raise
    finally:
        context.close()


with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='weapon-artwork-menu-') as directory:
    with open('/workspace/weapon-artwork-menu-server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_STATIC_SOURCE':'repository'},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                probe=browser.new_context()
                for _ in range(100):
                    try:
                        if probe.request.get(base+'/api/health',timeout=1000).ok:break
                    except Exception:time.sleep(.1)
                else:raise AssertionError('server did not start')
                probe.close()
                reports=[exercise(browser,base,width) for width in (1280,390)]
                Path('/workspace/weapon-artwork-menu-report.json').write_text(json.dumps(reports,indent=2))
                browser.close()
                print('PASS actual game weapon and utility graphics, lazy startup requests, selection and desktop/phone layout.')
        finally:
            server.terminate();server.wait(timeout=15)
