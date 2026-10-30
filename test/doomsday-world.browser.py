"""Scheduled cinematic, hidden guide, vehicles and automatic cleanup in the actual game."""
from pathlib import Path
import asyncio, math, os, socket, subprocess, tempfile, uuid
from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='automatic-doomsday-world-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(120):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    csrf = (await (await context.request.get(base + '/api/game/room-session')).json())['data']['csrfToken']
                    page = await context.new_page()
                    page.set_default_timeout(30000)
                    errors, inputs, manual_operations = [], [], []
                    page.on('pageerror', lambda error: (errors.append(str(error)), print('Page error:', error, flush=True)))
                    def record_input(request):
                        if request.method != 'POST' or '/gameplay' not in request.url:
                            return
                        fields = request.post_data_json or {}
                        if fields.get('action') == 'input':
                            inputs.append(fields.get('input', {}))
                        elif fields.get('action') == 'doomsday':
                            manual_operations.append(fields.get('operation'))
                    page.on('request', record_input)
                    await page.route('https://**/*', lambda route: route.abort())
                    await page.add_init_script('''localStorage.setItem('muzikaz.emergency.guide.hidden','true');window.automaticEmergencyPhases=[];setInterval(()=>{try{const phase=window.MuzikazHouseExplorer?.snapshot().doomsday?.phase;if(phase&&automaticEmergencyPhases.at(-1)!==phase)automaticEmergencyPhases.push(phase);}catch{}},60);''')

                    async def load(world):
                        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                        try:
                            await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && MuzikazHouseExplorer.snapshot().serverReady && MuzikazHouseExplorer.snapshot().doomsday?.automatic', timeout=180000)
                        except Exception:
                            await page.screenshot(path='/workspace/automatic-doomsday-world-startup-failed.png')
                            print(world, 'startup errors', errors, flush=True)
                            raise
                        print(world + ': actual automatic emergency ready', flush=True)
                        close = page.get_by_role('button', name='Close local quests', exact=True)
                        if await close.is_visible():
                            await close.click()
                        assert await page.locator('.doomsday-toggle,#doomsday-panel [data-operation]').count() == 0, 'A manual Doomsday control remains.'
                        return await page.evaluate('MuzikazHouseExplorer.snapshot()')

                    async def command(world, action, **fields):
                        response = await context.request.post(base + '/api/rooms/' + world + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (world, action, response.status, await response.text())
                        payload = await response.json()
                        return payload.get('data', payload)

                    async def phase(expected):
                        try:
                            await page.wait_for_function('(phase)=>MuzikazHouseExplorer.snapshot().doomsday?.phase===phase', arg=expected, timeout=110000)
                        except Exception:
                            print('Phase timeout:', expected, await page.evaluate('({history:automaticEmergencyPhases,state:MuzikazHouseExplorer.snapshot().doomsday})'), flush=True)
                            raise
                        return await page.evaluate('MuzikazHouseExplorer.snapshot()')

                    async def visit(world, objective):
                        await command(world, 'map-access', position=objective['position'])
                        await page.wait_for_function('(point)=>{const p=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-point.x,p[2]-point.z)<.15}', arg=objective['position'], timeout=15000)
                        await page.wait_for_function('(id)=>MuzikazHouseExplorer.snapshot().doomsday.objectives.some(o=>o.id===id&&o.completed)', arg=objective['id'], timeout=15000)

                    airport = 'muzikaz-airport'
                    state = await load(airport)
                    initial = state['doomsday']
                    assert initial['phase'] in ['idle','warning'], initial
                    if initial['phase'] == 'idle':
                        assert 15000 <= initial['nextEventAt'] - initial['scheduledAt'] <= 90000
                        assert not initial['active']
                        assert await page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)')
                        deadline = initial['nextEventAt']
                        await page.wait_for_timeout(400)
                        assert (await page.evaluate('MuzikazHouseExplorer.snapshot().doomsday.nextEventAt')) == deadline, 'idle snapshots resampled the deadline'
                        print('airport: quiet arrival retains a first warning deadline within two minutes', flush=True)
                    # Stream both aircraft during the quiet arrival window so a
                    # model decode cannot hide the brief detonation observation.
                    inputs.clear()
                    before = state['player']['position']
                    await page.keyboard.down('s');await page.wait_for_timeout(1200);await page.keyboard.up('s')
                    after = (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['player']['position']
                    assert any(abs(item.get('forward', 0)) > .5 for item in inputs), 'Hidden guide swallowed movement input.'
                    assert math.hypot(after[0] - before[0], after[2] - before[2]) > .2, (before, after)
                    for aircraft in ['airport-command-flight', 'airport-evacuation-flight']:
                        boarded = await command(airport, 'map-access', entityId=aircraft)
                        assert boarded['players'][boarded['selfId']]['vehicleId'] == aircraft
                        await page.wait_for_function('(id)=>MuzikazHouseExplorer.snapshot().vehicleId===id', arg=aircraft, timeout=30000)
                        current = await page.evaluate('MuzikazHouseExplorer.snapshot().doomsday')
                        if initial['phase'] == 'idle' and current['cycle'] == 0:
                            assert current['nextEventAt'] == deadline, 'Boarding resampled the arrival schedule.'
                    print('airport: quiet/hidden-guide movement and both emergency aircraft passed', flush=True)
                    state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
                    if state['doomsday']['phase'] == 'idle':
                        state = await phase('warning')
                    assert state['doomsday']['cycle'] == 1 and state['doomsday']['active']
                    if initial['phase'] == 'idle':
                        assert deadline <= state['doomsday']['startedAt'] <= deadline + 3000
                    assert 180000 <= state['doomsday']['nextEventAt'] - state['doomsday']['startedAt'] <= 1200000
                    event_id, detonation_at, fallout_at = [state['doomsday'][key] for key in ['id','detonationAt','falloutAt']]
                    recurring_deadline = state['doomsday']['nextEventAt']
                    assert fallout_at - detonation_at == 7000
                    assert not state['player']['inputBlocked'], 'Automatic guide blocked movement.'
                    assert await page.locator('.doomsday-guide').is_hidden()
                    assert await page.get_by_role('button', name='Show emergency guide', exact=True).is_visible()
                    print('airport: first event starts without buttons while guide stays hidden', flush=True)

                    # The shelter is optional: explosions and fallout must happen
                    # on schedule even with the guide hidden and no check-in.
                    await page.wait_for_function("automaticEmergencyPhases.includes('detonation')", timeout=45000)
                    assert await page.locator('.doomsday-guide').is_hidden()
                    state = await phase('fallout')
                    assert await page.locator('.doomsday-guide').is_hidden()
                    history = await page.evaluate('automaticEmergencyPhases')
                    assert history.index('warning') < history.index('detonation') < history.index('fallout'), history
                    assert not next(o for o in state['doomsday']['objectives'] if o['id']=='shelter')['completed']
                    await page.screenshot(path='/workspace/automatic-doomsday-world-fallout.png')
                    print('airport: real timed detonations and fallout continue with guide hidden', flush=True)

                    for objective_id, following in [('shelter','fallout'),('supplies','recovery'),('recovery','clearing')]:
                        state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
                        objective = next(item for item in state['doomsday']['objectives'] if item['id'] == objective_id)
                        await visit(airport, objective)
                        await phase(following)
                    clearing = await phase('clearing')
                    assert 7900 <= clearing['doomsday']['clearAt'] - clearing['doomsday']['phaseStartedAt'] <= 8100
                    state = await phase('all-clear')
                    assert state['doomsday']['completedCount'] == 3 and not state['doomsday']['active']
                    assert state['doomsday']['nextEventAt'] == recurring_deadline
                    assert state['controlsReady'] and not state['player']['inputBlocked']
                    await page.wait_for_timeout(8500)
                    assert await page.locator('.doomsday-guide,.doomsday-guide-chip,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)'), 'event UI remained after the all-clear interval'
                    assert (await page.evaluate('MuzikazHouseExplorer.snapshot().doomsday.cycle')) == 1, 'the event restarted before the recurring deadline'
                    assert not manual_operations, manual_operations
                    print('airport: quests, clearing animation, quiet all-clear and stable 3–20 minute repeat deadline passed', flush=True)

                    state = await load('world-district-neon-docks')
                    local = state['doomsday']
                    assert local['mapId'] == 'world-district-neon-docks'
                    assert local['phase'] in ['idle','warning'] and local['cycle'] <= 1
                    if local['phase'] == 'idle':
                        assert 15000 <= local['nextEventAt'] - local['scheduledAt'] <= 90000
                        assert await page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)')
                    assert state['controlsReady'] and not state['player']['inputBlocked']
                    assert not errors, errors
                    print('marina: independent quiet arrival schedule and normal controls passed', flush=True)
                    await browser.close()
            finally:
                server.terminate();server.wait(timeout=15)


asyncio.run(main())
