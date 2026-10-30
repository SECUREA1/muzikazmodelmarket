"""Recurring cinematic with original quest-led duration and optional challenge tracking."""
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
                    await page.add_init_script('''localStorage.setItem('muzikaz.emergency.guide.hidden','true');localStorage.removeItem('muzikaz.emergency.challenge.follow');window.MUZIKAZ_AUDIO_SESSION_OVERRIDES={masterMuted:true,effectsMuted:true,announcementsMuted:true,effectsVolume:0,dialogueMuted:true,mediaMuted:true};window.automaticEmergencyPhases=[];setInterval(()=>{try{const phase=window.MuzikazHouseExplorer?.snapshot().doomsday?.phase;if(phase&&automaticEmergencyPhases.at(-1)!==phase)automaticEmergencyPhases.push(phase);}catch{}},60);''')

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
                            try:
                                await close.click(timeout=15000)
                            except Exception:
                                await page.screenshot(path='/workspace/mobile-emergency-airport-controls-overlap.png')
                                print('Quest and radio bounds:', await page.evaluate("JSON.stringify([...document.querySelectorAll('.map-quest-card,.map-quest-card header button,.doomsday-guide-chip,.house-stage')].map(n=>({selector:n.className||n.getAttribute('aria-label'),bounds:n.getBoundingClientRect().toJSON()})))"), flush=True)
                                raise
                        assert await page.locator('.doomsday-toggle,#doomsday-panel [data-operation]').count() == 0, 'A manual Doomsday control remains.'
                        return await page.evaluate('MuzikazHouseExplorer.snapshot()')

                    async def command(world, action, **fields):
                        response = await context.request.post(base + '/api/rooms/' + world + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (world, action, response.status, await response.text())
                        payload = await response.json()
                        return payload.get('data', payload)

                    async def open_radio():
                        chip=page.get_by_role('button',name='Show emergency guide',exact=True)
                        if not await chip.is_visible():
                            await page.get_by_role('button',name='More view controls',exact=True).click()
                        if await page.locator('.doomsday-guide').is_hidden():
                            await chip.click()

                    async def close_radio():
                        if await page.locator('.doomsday-guide').is_visible():
                            await page.get_by_role('button',name='Hide emergency guide',exact=True).click()
                        more=page.get_by_role('button',name='More view controls',exact=True)
                        if await more.get_attribute('aria-expanded')=='true':
                            await more.click()

                    async def phase(expected):
                        try:
                            await page.wait_for_function('(phase)=>MuzikazHouseExplorer.snapshot().doomsday?.phase===phase', arg=expected, timeout=190000)
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
                    # The sound controls can recover muted/zero-volume account
                    # settings during arrival, without starting a world event.
                    await page.evaluate("""()=>{const overrides={masterMuted:true,effectsMuted:true,announcementsMuted:true,effectsVolume:0,dialogueMuted:true,mediaMuted:true};window.MUZIKAZ_AUDIO_SESSION_OVERRIDES={...window.MUZIKAZ_AUDIO_SESSION_OVERRIDES,...overrides};const preferences={...window.MUZIKAZ_AUDIO_PREFERENCES,...overrides};window.MUZIKAZ_AUDIO_PREFERENCES=preferences;window.dispatchEvent(new CustomEvent('muzikaz:audio-preferences',{detail:preferences}));}""")
                    await open_radio()
                    await page.wait_for_function("document.querySelector('#doomsday-panel').dataset.audioState==='master-muted'")
                    await page.get_by_role('button', name='Enable sounds', exact=True).tap()
                    await page.wait_for_function("['ready','playing'].includes(document.querySelector('#doomsday-panel').dataset.audioState)")
                    recovered = await page.evaluate('MUZIKAZ_AUDIO_PREFERENCES')
                    assert not recovered['masterMuted'] and not recovered['effectsMuted'] and not recovered['announcementsMuted']
                    assert recovered['effectsVolume'] == 100 and recovered['dialogueMuted'] and recovered['mediaMuted']
                    assert await page.get_by_role('switch', name='Sirens and explosions', exact=True).is_checked()
                    await page.screenshot(path='/workspace/mobile-emergency-airport-sound-panel.png')
                    await close_radio()
                    assert await page.locator('.doomsday-guide').is_hidden()
                    assert await page.get_by_role('button', name='More view controls', exact=True).is_visible()
                    print('airport: visible sound controls recover muted effects and zero volume while preserving other settings', flush=True)
                    state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
                    after_audio = state['doomsday']
                    if initial['phase'] == 'idle' and after_audio['phase'] == 'idle':
                        assert after_audio['nextEventAt'] == initial['nextEventAt'], 'Enabling sounds changed the event schedule.'
                    initial = after_audio
                    if initial['phase'] == 'idle':
                        assert 42000 <= initial['nextEventAt'] - initial['scheduledAt'] <= 162000
                        assert not initial['active']
                        assert await page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)')
                        deadline = initial['nextEventAt']
                        await page.wait_for_timeout(400)
                        assert (await page.evaluate('MuzikazHouseExplorer.snapshot().doomsday.nextEventAt')) == deadline, 'idle snapshots resampled the deadline'
                        print('airport: quiet arrival retains a stable first impact deadline within one to three minutes', flush=True)
                    # Stream both aircraft during the quiet arrival window so a
                    # model decode cannot hide the brief detonation observation.
                    inputs.clear()
                    before = state['player']['position']
                    await page.keyboard.down('s');await page.wait_for_timeout(1200);await page.keyboard.up('s')
                    after = (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['player']['position']
                    assert any(abs(item.get('forward', 0)) > .5 for item in inputs), 'Hidden guide swallowed movement input.'
                    assert math.hypot(after[0] - before[0], after[2] - before[2]) > .2, (before, after)
                    for aircraft in ['airport-command-flight', 'airport-evacuation-flight']:
                        await open_radio()
                        await page.locator('[data-board-aircraft="'+aircraft+'"]').click()
                        await page.wait_for_function('(id)=>MuzikazHouseExplorer.snapshot().vehicleId===id', arg=aircraft, timeout=30000)
                        await close_radio()
                        boarded = await command(airport, 'airport-radio', operation='status')
                        assert boarded['players'][boarded['selfId']]['vehicleId'] == aircraft
                        departure = page.get_by_role('region', name='Emergency departure guide')
                        await departure.wait_for(state='visible')
                        await page.get_by_role('button', name='Start emergency departure', exact=True).tap()
                        await page.wait_for_function("/Preflight|Taxi|Hold short/.test(document.querySelector('[data-departure-stage]').textContent)")
                        await page.wait_for_timeout(3000)
                        active = await command(airport, 'airport-radio', operation='status')
                        flight = active['actors'][aircraft]['flight']
                        assert flight['assist'] == 'emergency-departure' and flight['emergencyDeparture']['ownerId'] == active['selfId'], flight
                        assert active['players'][active['selfId']]['health'] == boarded['players'][boarded['selfId']]['health'], (boarded['players'][boarded['selfId']]['health'], active['players'][active['selfId']]['health'])
                        assert active['actors'][aircraft]['health'] == boarded['actors'][aircraft]['health'], flight
                        assert math.hypot(active['actors'][aircraft]['position']['x']-boarded['actors'][aircraft]['position']['x'], active['actors'][aircraft]['position']['z']-boarded['actors'][aircraft]['position']['z']) < 15, 'Departure relocated the aircraft.'
                        await page.get_by_role('button', name='Take manual flight control', exact=True).tap()
                        await page.wait_for_function("document.querySelector('[data-departure-stage]').textContent==='Manual control'")
                        assert (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['controlsReady']
                        current = await page.evaluate('MuzikazHouseExplorer.snapshot().doomsday')
                        if initial['phase'] == 'idle' and current['cycle'] == 0:
                            assert current['nextEventAt'] == deadline, 'Boarding resampled the arrival schedule.'
                    print('airport: both real emergency cockpits run physical departure, clear pending inputs and return manual control without damage or relocation', flush=True)
                    state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
                    if state['doomsday']['phase'] == 'idle':
                        state = await phase('warning')
                    assert state['doomsday']['cycle'] == 1 and state['doomsday']['active']
                    if initial['phase'] == 'idle':
                        assert deadline <= state['doomsday']['startedAt'] <= deadline + 3000
                    assert state['doomsday']['nextEventAt'] is None, 'An active original-length event must not have a cutoff or queued replacement.'
                    await open_radio()
                    assert await page.locator('.doomsday-evacuation').is_visible()
                    onboard = await command(airport, 'airport-radio', operation='status')
                    progress = onboard['players'][onboard['selfId']]['emergencyEvacuation']
                    assert progress['eventId'] == state['doomsday']['id'] and progress['stage'] == 'preflight', progress
                    await close_radio()
                    event_id, detonation_at, fallout_at = [state['doomsday'][key] for key in ['id','detonationAt','falloutAt']]
                    assert fallout_at - detonation_at == 7000
                    assert not state['player']['inputBlocked'], 'Automatic guide blocked movement.'
                    assert await page.locator('.doomsday-guide').is_hidden()
                    assert await page.get_by_role('button', name='More view controls', exact=True).is_visible()
                    print('airport: first event starts without buttons while guide stays hidden', flush=True)

                    # The shelter is optional: explosions and fallout must happen
                    # on schedule even with the guide hidden and no check-in.
                    await page.wait_for_function("automaticEmergencyPhases.includes('detonation')", timeout=45000)
                    assert await page.locator('.doomsday-guide').is_hidden()
                    state = await phase('fallout')
                    assert 'Relief flights circling' in await page.locator('[data-response-status]').text_content()
                    assert await page.locator('.doomsday-guide').is_hidden()
                    history = await page.evaluate('automaticEmergencyPhases')
                    assert history.index('warning') < history.index('detonation') < history.index('fallout'), history
                    assert not next(o for o in state['doomsday']['objectives'] if o['id']=='shelter')['completed']
                    await page.screenshot(path='/workspace/automatic-doomsday-world-fallout.png')
                    print('airport: real timed detonations and fallout continue with guide hidden', flush=True)
                    assert state['doomsday']['phaseEndsAt'] is None and state['doomsday']['recoveryAt'] is None, 'Fallout was shortened by a timeout.'

                    # Enter the back of the real shelter, beyond the old marker
                    # radius, with both the guide and optional challenge off.
                    await command(airport, 'map-access', position={'x': -150, 'y': 0, 'z': 28})
                    await page.wait_for_function("MuzikazHouseExplorer.snapshot().doomsday.objectives.some(o=>o.id==='shelter'&&o.completed)")
                    await page.wait_for_function("document.querySelector('#doomsday-panel [data-transcript]').textContent.includes('Shelter reached')")
                    arrival = await page.locator('#doomsday-panel [data-transcript]').text_content()
                    assert 'next response step' in arrival and 'Relief supply' in arrival, arrival
                    assert await page.locator('.doomsday-guide').is_hidden()
                    assert not await page.locator('input[data-follow-challenge]').is_checked(), 'Shelter entry forced challenge tracking on.'
                    inside = await page.evaluate('MuzikazHouseExplorer.snapshot()')
                    assert inside['doomsday']['id'] == event_id and inside['doomsday']['phase'] == 'fallout' and inside['doomsday']['active']
                    assert inside['doomsday']['nextEventAt'] is None and not inside['player']['inputBlocked']
                    before_inside = inside['player']['position']
                    await page.keyboard.down('w');await page.wait_for_timeout(500);await page.keyboard.up('w')
                    after_inside = (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['player']['position']
                    assert math.hypot(after_inside[0] - before_inside[0], after_inside[2] - before_inside[2]) > .1, 'Shelter arrival blocked movement.'
                    print('airport: back-interior arrival recognized automatically, next step announced, event and movement remain active with challenge off', flush=True)

                    await open_radio()
                    follow = page.locator('input[data-follow-challenge]')
                    assert not await follow.is_checked(), 'Challenge tracking must be optional and off by default.'
                    assert await page.locator('[data-challenge]').is_hidden()
                    before_follow = state['doomsday']['id']
                    await follow.check()
                    assert await page.locator('[data-challenge]').is_visible()
                    await close_radio()
                    assert await follow.is_checked(), 'Hiding the radio guide stopped following the challenge.'
                    current = await page.evaluate('MuzikazHouseExplorer.snapshot().doomsday')
                    assert current['id'] == before_follow and current['phase'] == 'fallout', 'The follow switch changed the automatic world event.'
                    print('airport: passive event retains quest-led duration; popup follow toggle is optional and persists when hidden', flush=True)

                    for objective_id, following in [('shelter','fallout'),('supplies','recovery'),('recovery','clearing')]:
                        state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
                        objective = next(item for item in state['doomsday']['objectives'] if item['id'] == objective_id)
                        await visit(airport, objective)
                        await phase(following)
                    clearing = await phase('clearing')
                    assert 7900 <= clearing['doomsday']['clearAt'] - clearing['doomsday']['phaseStartedAt'] <= 8100
                    assert clearing['doomsday']['nextEventAt'] is None
                    state = await phase('all-clear')
                    assert state['doomsday']['completedCount'] == 3 and not state['doomsday']['active']
                    recurring_deadline = state['doomsday']['nextEventAt']
                    assert 180000 <= recurring_deadline - state['doomsday']['clearAt'] <= 1200000, 'The quiet break must start after the complete quest-led event.'
                    assert state['controlsReady'] and not state['player']['inputBlocked']
                    await page.wait_for_timeout(8500)
                    assert await page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)'), 'event UI remained after the all-clear interval'
                    assert await page.get_by_role('button', name='More view controls', exact=True).is_visible(), 'Sound controls must remain available inside the header during the quiet break.'
                    assert (await page.evaluate('MuzikazHouseExplorer.snapshot().doomsday.cycle')) == 1, 'the event restarted before the recurring deadline'
                    assert not manual_operations, manual_operations
                    print('airport: full quest-led event, clearing animation and 3–20 minute quiet break after completion passed', flush=True)

                    state = await load('world-district-neon-docks')
                    local = state['doomsday']
                    assert local['mapId'] == 'world-district-neon-docks'
                    assert local['phase'] in ['idle','warning'] and local['cycle'] <= 1
                    if local['phase'] == 'idle':
                        assert 42000 <= local['nextEventAt'] - local['scheduledAt'] <= 162000
                        assert await page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)')
                    assert state['controlsReady'] and not state['player']['inputBlocked']
                    assert not errors, errors
                    print('marina: independent quiet arrival schedule and normal controls passed', flush=True)
                    await browser.close()
            finally:
                server.terminate();server.wait(timeout=15)


asyncio.run(main())
