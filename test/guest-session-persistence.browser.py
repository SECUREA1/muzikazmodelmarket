"""Guest identity survives cookie blocking, reloads and travel between live maps.

Uses the real guest access dialog, API and rendered game. API cookies are stripped
in both directions, matching browsers that block the hosted service's cookies.
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


async def check_identity_and_movement(page, expected_account=None):
    try:
        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=120000)
    except Exception:
        await page.screenshot(path='/tmp/guest-session-persistence-failed.png')
        print(await page.evaluate('''()=>{
              const state=window.MuzikazHouseExplorer?.snapshot();
              return {state:state&&{controlsReady:state.controlsReady,serverReady:state.serverReady,
              roomId:state.roomId,worldLoading:state.worldLoading,gameplayStarted:state.gameplayStarted},
              dialogs:[...document.querySelectorAll('dialog[open]')].map(node=>node.textContent.slice(0,500)),
              status:document.querySelector('#house-status')?.textContent};}'''), flush=True)
        raise
    assert await page.locator('.play-access-dialog[open]').count() == 0, 'Guest was asked to sign in again.'
    account = await page.evaluate('''async()=>{
        const {SharedGameInventory}=await import('/public/js/shared-game-inventory.js');
        return (await new SharedGameInventory().session()).account.accountId;
    }''')
    if expected_account:
        assert account == expected_account, 'Guest identity changed after reload or map travel.'
    # Inspect a real server-applied movement command rather than depending on
    # a spawn point being clear in every direction.
    async with page.expect_response(lambda response: response.ok and '/gameplay' in response.url
                                    and response.request.method == 'POST'
                                    and (response.request.post_data_json or {}).get('action') == 'input'
                                    and abs((response.request.post_data_json or {}).get('input', {}).get('forward', 0)) > .1,
                                    timeout=20000) as incoming:
        await page.keyboard.down('w')
        try:
            response = await incoming.value
            state = (await response.json())['data']
            assert abs(state['players'][state['selfId']]['input']['forward']) > .1, 'Guest movement was rejected.'
        finally:
            await page.keyboard.up('w')
    return account


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='guest-session-persistence-') as directory:
        with open(Path(directory)/'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port),
                                      'MUZIKAZ_DATA_DIR': directory, 'MUZIKAZ_STATIC_SOURCE': 'repository'},
                                      stdout=log, stderr=log)
            try:
                async with async_playwright() as playwright:
                    probe = await playwright.request.new_context()
                    for _ in range(100):
                        try:
                            if (await probe.get(base+'/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.15)
                    else:
                        raise AssertionError('Local game server did not start.')
                    await probe.dispose()
                    browser = await playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                                               args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 1280, 'height': 800},
                                                        service_workers='block', reduced_motion='reduce')
                    page = await context.new_page()
                    page.set_default_timeout(30000)
                    errors, guest_posts = [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))

                    # Omit credentials at the browser transport so fetch neither
                    # sends Cookie nor accepts Set-Cookie. Keep streaming event
                    # connections untouched; no API cookies can enter the jar.
                    await context.add_init_script('''(()=>{
                        const transport=window.fetch.bind(window);
                        window.fetch=(resource,options={})=>{
                            const address=new URL(typeof resource==='string'?resource:resource.url,location.href);
                            return transport(resource,address.pathname.startsWith('/api/')?{...options,credentials:'omit'}:options);
                        };
                    })();''')
                    page.on('response', lambda response: guest_posts.append(response.status)
                            if response.request.method == 'POST' and response.url.endswith('/api/access/guest') else None)

                    await page.route('https://**/*', lambda route: route.abort())
                    await page.goto(base+'/model-explorer.html?environment=public-commons&house=public-commons&autoplay=1&mode=multiplayer',
                                    wait_until='domcontentloaded', timeout=90000)
                    access = page.get_by_role('dialog', name='Choose how to play', exact=True)
                    await access.wait_for(state='visible', timeout=120000)
                    # A new guest must replace stale account/game proofs left by
                    # a previous login, including when only cookies worked before.
                    await page.evaluate('''()=>{
                        MUZIKAZ_API.setSessionToken('stale-account-before-guest');
                        MUZIKAZ_API.setGameSessionToken('stale-game-before-guest');
                    }''')
                    await access.get_by_role('button', name='Continue as guest', exact=True).click()
                    first_account = await check_identity_and_movement(page)
                    print('Cookie-blocked guest entry and live movement passed.', flush=True)
                    assert await page.evaluate('''()=>{
                        const token=localStorage.getItem('muzikazAccountSessionToken');
                        return !!token&&token!=='stale-account-before-guest'&&MUZIKAZ_API.getSessionToken()===token;
                    }'''), 'Successful guest access did not persist its bearer proof.'
                    assert await page.evaluate("MUZIKAZ_API.getGameSessionToken()!=='stale-game-before-guest'"), 'Old game proof survived account replacement.'

                    await context.clear_cookies()
                    await page.reload(wait_until='domcontentloaded', timeout=90000)
                    await check_identity_and_movement(page, first_account)
                    print('Guest identity and movement survived reload.', flush=True)

                    await page.evaluate("MUZIKAZ_API.setGameSessionToken('expired-game-proof')")
                    await check_identity_and_movement(page, first_account)
                    print('Live movement survives an invalid game proof while the guest account remains valid.', flush=True)

                    # This uses the game's visible world picker and live join,
                    # so navigation cannot pass by merely restoring display data.
                    print('Opening World picker.', flush=True)
                    await page.locator('#house-world-button').click(timeout=30000)
                    await page.locator('[data-world-search]').fill('world-district-neon-docks', timeout=30000)
                    print('Selecting Neon Docks and joining.', flush=True)
                    await page.locator('[data-world-id="world-district-neon-docks"]').click(timeout=30000)
                    await page.locator('[data-world-join]').click(timeout=30000)
                    await page.wait_for_function("MuzikazHouseExplorer.snapshot().roomId==='world-district-neon-docks'&&MuzikazHouseExplorer.snapshot().controlsReady", timeout=120000)
                    await check_identity_and_movement(page, first_account)
                    print('Guest identity and movement survived map travel.', flush=True)
                    await context.clear_cookies()
                    print('Reloading destination.', flush=True)
                    await page.reload(wait_until='domcontentloaded', timeout=90000)
                    await check_identity_and_movement(page, first_account)
                    assert guest_posts == [201], ('Guest account was recreated.', guest_posts)
                    assert not await context.cookies(), 'Cookie-blocked regression accepted a server cookie.'
                    assert not errors, errors
                    await page.screenshot(path='/tmp/muzikaz-header-desktop.png')
                    await page.set_viewport_size({'width': 390, 'height': 844})
                    await page.wait_for_timeout(500)
                    more = page.get_by_role('button', name='More view controls', exact=True)
                    if await more.is_visible():
                        await more.click()
                    await page.screenshot(path='/tmp/muzikaz-header-mobile.png')
                    await context.close()
                    await browser.close()
                    print(json.dumps({'passed': True, 'cookiesBlocked': True, 'guestAccountsCreated': 1,
                                      'reloads': 2, 'mapTravel': True, 'serverAppliedMovement': True}))
            finally:
                server.terminate()
                server.wait(timeout=15)


async def bounded_main():
    await asyncio.wait_for(main(), timeout=360)


asyncio.run(bounded_main())
