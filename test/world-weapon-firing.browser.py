"""Equip and fire the starter laser through the real game UI with RAD-TOX off.

A response-only inspector records cosmetic effects from the production controller;
all input, inventory, room commands, audio and WebGL use the actual game runtime.
"""
from pathlib import Path
import asyncio
import json
import os
import socket
import subprocess
import tempfile
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
WORLDS = ['land-field-volt-city', 'muzikaz-fitness-centre', 'muzikaz-casino', 'basketball-arena', 'muzikaz-main']

INSPECTOR = '''
  // Limit software rasterization between actions; the controller, room loop and
  // actual firing frames continue to run. Pixel visibility is verified separately.
  const auditRender=renderer.render.bind(renderer);let auditFrame=0;
  renderer.render=(...args)=>{auditFrame++;if(auditFrame<3||window.weaponAudit?.shots.length)return auditRender(...args);};
  window.weaponAudit={shots:[],oscillators:0,audio:()=>({state:toxicBubbleSystem.audioContext?.state,volume:toxicBubbleSystem.soundGain?.gain.value})};
  const auditWeaponShot=toxicBubbleSystem.showWeaponShot.bind(toxicBubbleSystem);
  toxicBubbleSystem.showWeaponShot=(...args)=>{
    const before=toxicBubbleSystem.lasers.length,result=auditWeaponShot(...args),effects=toxicBubbleSystem.lasers.slice(before);
    weaponAudit.shots.push({tool:args[0],beams:effects.filter(effect=>effect.isMesh&&!effect.userData.weaponFlash&&effect.geometry.parameters.height>0).length,flashes:effects.filter(effect=>effect.userData.weaponFlash).length});
    return result;
  };
'''

async def exercise(browser, base, world):
    context = await browser.new_context(viewport={'width': 390, 'height': 700}, device_scale_factor=1, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
    assert (await context.request.post(base+'/api/access/guest', data={})).status == 201
    page = await context.new_page()
    errors, commands, responses = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: commands.append(request.post_data_json or {}) if request.method=='POST' and '/gameplay' in request.url else None)

    async def record_response(response):
        if response.request.method=='POST' and '/gameplay' in response.url and (response.request.post_data_json or {}).get('action')=='fire':
            responses.append({'ok':response.ok, 'status':response.status, 'body':await response.json()})
    page.on('response', record_response)
    await page.route('https://**/*', lambda route: route.abort())
    async def inspect_source(route):
        response = await route.fetch()
        source = (await response.text()).replace('  window.MuzikazHouseExplorer = {', INSPECTOR+'\n  window.MuzikazHouseExplorer = {')
        await route.fulfill(response=response, body=source)
    await page.route('**/public/js/house-explorer-glb.js*', inspect_source)
    await page.add_init_script('''
      const original=AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator=function(...args){if(window.weaponAudit)weaponAudit.oscillators++;return original.apply(this,args);};
    ''')
    try:
        print(json.dumps({'world':world,'phase':'loading'}),flush=True)
        await page.goto(base+'/model-explorer.html?environment='+world+'&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
        await page.wait_for_function('(world)=>{const s=window.MuzikazHouseExplorer?.snapshot();return s?.controlsReady&&s.roomId===world;}',arg=world,timeout=90000)
        print(json.dumps({'world':world,'phase':'ready'}),flush=True)
        await page.locator('dialog[open]').evaluate_all('(dialogs)=>dialogs.forEach(dialog=>dialog.close())')
        await page.locator('[data-house-tools]').evaluate('(button)=>button.click()')
        await page.locator('[data-weapons-category]').evaluate('(button)=>button.click()')
        await page.locator('#rad-weapons-popup [data-rad-tool="laser"]').evaluate('(button)=>button.click()')
        await page.wait_for_function('MuzikazHouseExplorer.snapshot().tool==="laser"&&!MuzikazHouseExplorer.snapshot().player.inputBlocked')
        fire = page.get_by_role('button',name='Fire selected weapon',exact=True)
        await fire.wait_for(state='visible',timeout=15000)
        box=await fire.bounding_box()
        await page.mouse.click(box['x']+box['width']/2, box['y']+box['height']/2)
        await page.wait_for_function('weaponAudit.shots.length>0&&weaponAudit.audio().state==="running"',timeout=10000)
        for _ in range(100):
            if responses:break
            await asyncio.sleep(.1)
        audit=await page.evaluate('({shots:weaponAudit.shots,oscillators:weaponAudit.oscillators,audio:weaponAudit.audio(),state:MuzikazHouseExplorer.snapshot(),encounterOff:document.querySelector(".house-stage").classList.contains("rad-tox-disabled")})')
        assert audit['encounterOff'],audit
        assert audit['shots'][0]=={'tool':'laser','beams':1,'flashes':1},audit
        assert audit['oscillators']>0 and audit['audio']['volume']>0,audit
        assert responses and all(response['ok'] for response in responses),responses
        assert any(command.get('action')=='fire' and command.get('tool')=='laser' for command in commands),commands
        assert not any(command.get('action')=='start-rad-tox' for command in commands),commands
        assert not errors,errors
        result={'world':world,'passed':True,'effects':audit['shots'][0],'audio':audit['audio'],'oscillators':audit['oscillators'],'confirmedFire':len(responses),'encountersOff':audit['encounterOff']}
        print(json.dumps(result),flush=True)
        return result
    except Exception as error:
        try:
            await page.screenshot(path='/tmp/weapon-firing-'+world+'.png')
            state=await page.evaluate('({status:document.querySelector("[data-house-status]")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.className),state:window.MuzikazHouseExplorer?.snapshot()})')
        except Exception:
            state={}
        result={'world':world,'passed':False,'error':str(error),'pageErrors':errors,'responses':responses,'diagnostic':state}
        print(json.dumps(result),flush=True)
        return result
    finally:
        await context.close()

async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='world-weapon-firing-') as directory:
        with open(Path(directory)/'server.log','w') as log:
            server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
            try:
                async with async_playwright() as p:
                    browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                    base=f'http://127.0.0.1:{port}'
                    probe=await browser.new_context()
                    for _ in range(100):
                        try:
                            if (await probe.request.get(base+'/api/health',timeout=1000)).ok:break
                        except Exception:await asyncio.sleep(.15)
                    await probe.close()
                    results=[]
                    for world in WORLDS:results.append(await exercise(browser,base,world))
                    await browser.close()
                    Path('/tmp/world-weapon-firing-results.json').write_text(json.dumps(results,indent=2))
                    assert all(result['passed'] for result in results),results
            finally:
                server.terminate();server.wait(timeout=15)

asyncio.run(main())
