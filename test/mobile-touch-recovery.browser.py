"""Sustained real touch input and recovery from interrupted mobile gestures.

Chromium emulates an iPhone viewport and receives CDP touch input. Discarded
terminal events simulate an OS/browser suspension; this is not a WebKit test.
"""
from pathlib import Path
import asyncio, json, os, shutil, socket, subprocess, tempfile, time
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

os.chdir(Path(__file__).resolve().parents[1])


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='mobile-touch-recovery-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(**p.devices['iPhone 13'], service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(80):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    for world in os.environ.get('MUZIKAZ_TEST_WORLDS', 'muzikaz-airport,world-district-neon-docks').split(','):
                        page = await context.new_page()
                        page.set_default_timeout(30000)
                        errors, inputs, server_frames, phase_traces = [], [], [], []
                        await page.add_init_script('''(() => {
                            const NativeObserver=window.IntersectionObserver;
                            window.touchStageIntersections=[];
                            window.touchContextEvents=[];
                            for(const type of ['webglcontextlost','webglcontextrestored'])document.addEventListener(type,event=>touchContextEvents.push({type,at:performance.now(),canvas:event.target.id}),true);
                            window.IntersectionObserver=class extends NativeObserver {
                                constructor(callback,options){super((entries,observer)=>{
                                    for(const entry of entries)if(entry.target.matches('.house-stage')){
                                        touchStageIntersections.push({at:performance.now(),intersecting:entry.isIntersecting,ratio:entry.intersectionRatio,rect:{x:entry.boundingClientRect.x,y:entry.boundingClientRect.y,width:entry.boundingClientRect.width,height:entry.boundingClientRect.height}});
                                        if(touchStageIntersections.length>64)touchStageIntersections.shift();
                                    }
                                    callback(entries,observer);
                                },options);}
                            };
                        })();''')
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        async def record_state(response):
                            if '/api/rooms/' + world + '/gameplay' not in response.url or not response.ok:
                                return
                            try:
                                payload = await response.json()
                                state = payload.get('data', payload)
                                players = state.get('players', {})
                                own = players.get(state.get('selfId')) or next((player for key, player in players.items() if key.startswith('account:')), None)
                                if own:
                                    server_frames.append({'sequence': state.get('sequence'), 'serverTime': state.get('serverTime'), 'simulationTime':state.get('simulationTime'), 'receivedAt':time.time()*1000, 'position': own.get('position'), 'input': own.get('input'), 'movementRevision': own.get('movementRevision')})
                                    del server_frames[:-8]
                            except Exception:
                                pass
                        page.on('response', record_state)
                        def record_input(request):
                            if request.method == 'POST' and '/gameplay' in request.url:
                                body = request.post_data_json or {}
                                if body.get('action') == 'input':
                                    inputs.append(body.get('input', {}))
                        page.on('request', record_input)
                        await page.route('https://**/*', lambda route: route.abort())
                        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)
                        assert await page.evaluate('MuzikazHouseExplorer.snapshot().roomId') == world
                        # The room handshake completes before the first large
                        # scene finishes shader compilation in software WebGL.
                        await page.wait_for_timeout(1500)
                        await page.evaluate('''async () => {
                            await new Promise(requestAnimationFrame);
                            await new Promise(requestAnimationFrame);
                            const {LocalWalkingView}=await import('/public/js/local-walking-view.js');
                            const originalSample=LocalWalkingView.prototype.sample;
                            window.touchWalkingSamples=0;
                            window.touchWalkingHeldSamples=0;
                            LocalWalkingView.prototype.sample=function(now,delta,input,...rest){
                                const result=originalSample.call(this,now,delta,input,...rest);
                                touchWalkingSamples++;
                                if(delta>0&&Math.abs(input.forward||0)+Math.abs(input.side||0)>.3)touchWalkingHeldSamples++;
                                window.touchWalkingLatest={at:performance.now(),now,delta,input:{...input},receivedAt:this.motion.receivedAt,lastSnapshot:this.motion.lastSnapshot,position:{...this.position},grounded:this.grounded};
                                return result;
                            };
                            const originalReconcile=LocalWalkingView.prototype.reconcile;
                            window.touchWalkingReconciles=[];
                            LocalWalkingView.prototype.reconcile=function(position,options){
                                const result=originalReconcile.call(this,position,options);
                                touchWalkingReconciles.push({at:performance.now(),position:{...position},options:{...options},receivedAt:this.motion.receivedAt,lastSnapshot:this.motion.lastSnapshot});
                                if(touchWalkingReconciles.length>8)touchWalkingReconciles.shift();
                                return result;
                            };
                            window.touchFrameCount=0;
                            const sample=()=>{touchFrameCount++;requestAnimationFrame(sample);};
                            requestAnimationFrame(sample);
                        }''')
                        cdp = await context.new_cdp_session(page)
                        touch_id = 0

                        async def center(name):
                            stick = page.locator('[data-thumbstick="' + name + '"] .thumbstick-base')
                            # Overlay taps may scroll the document to its corner
                            # buttons. CDP does not scroll an offscreen touch target.
                            await stick.scroll_into_view_if_needed()
                            box = await stick.bounding_box()
                            assert box and box['width'] > 0, (world, name, 'controller missing')
                            viewport = await page.evaluate('({width:innerWidth,height:innerHeight,scrollY})')
                            assert 0 <= box['x'] + box['width'] / 2 <= viewport['width'] and 0 <= box['y'] + box['height'] / 2 <= viewport['height'], (world, name, 'controller outside viewport', box, viewport)
                            assert await stick.evaluate('(node)=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return node===hit||node.contains(hit); }'), (world, name, 'controller touch intercepted')
                            return box['x'] + box['width'] / 2, box['y'] + box['height'] / 2

                        async def touch(kind, points):
                            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})

                        async def begin(names=('left',), reverse=False, direction=None):
                            nonlocal touch_id
                            points = []
                            for name in names:
                                touch_id += 1
                                x, y = await center(name)
                                points.append({'id': touch_id, 'x': x, 'y': y})
                            await touch('touchStart', points)
                            dx, dy = direction or (0, 1 if reverse else -1)
                            moved = [{**point, 'x':point['x']+23*dx, 'y': point['y'] + 23*dy} if name == 'left' else {**point, 'x': point['x'] + (-10 if reverse else 10)} for name, point in zip(names, points)]
                            await touch('touchMove', moved)
                            return moved

                        async def diagnose():
                            result = await page.evaluate('''() => {
                                const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
                                return {state:MuzikazHouseExplorer.snapshot(),frames:touchFrameCount,hidden:document.hidden,visibility:document.visibilityState,scroll:{x:scrollX,y:scrollY},viewport:{width:innerWidth,height:innerHeight,visualWidth:visualViewport?.width,visualHeight:visualViewport?.height,offsetTop:visualViewport?.offsetTop,offsetLeft:visualViewport?.offsetLeft,scale:visualViewport?.scale},stage:rect(document.querySelector('.house-stage')),stageClientHeight:document.querySelector('.house-stage')?.clientHeight,shell:rect(document.querySelector('.house-explorer-shell')),sticks:[...document.querySelectorAll('.thumbstick-base')].map(rect),intersections:window.touchStageIntersections?.slice(-8),contexts:window.touchContextEvents,walkingSamples:window.touchWalkingSamples,walkingHeldSamples:window.touchWalkingHeldSamples,walkingLatest:window.touchWalkingLatest,walkingReconciles:window.touchWalkingReconciles,overlays:[...document.querySelectorAll('dialog[open], #crib-chat-panel:not([hidden]), .world-resident-ui:not([hidden]) .world-resident-panel:not([hidden])')].map(node=>node.className)};
                            }''')
                            result['serverFrames']=server_frames[:]
                            return result

                        async def move_once(label, names=('left',), reverse=False, direction=None):
                            await begin(names, reverse, direction)
                            held_samples = await page.evaluate('touchWalkingHeldSamples')
                            await page.wait_for_timeout(650)
                            # Require a real, positive-delta game sample with this
                            # finger still held; a global RAF is not sufficient.
                            try:
                                await page.wait_for_function('(before)=>touchWalkingHeldSamples>before', arg=held_samples, timeout=4000)
                            except PlaywrightTimeoutError as error:
                                diagnostic = await diagnose()
                                diagnostic['phase'] = label
                                Path('/tmp/mobile-touch-failed-diagnostic.json').write_text(json.dumps(diagnostic))
                                await page.screenshot(path='/tmp/mobile-touch-failed.png')
                                await touch('touchEnd', [])
                                raise AssertionError((world, label, 'no actual game input sample while finger held', diagnostic, errors)) from error
                            await touch('touchEnd', [])
                            await page.wait_for_timeout(120)
                            return await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')

                        async def drag(label, reverse=False, dual=False):
                            inputs.clear()
                            start = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
                            yaw = await page.evaluate('MuzikazHouseExplorer.snapshot().player.yaw')
                            end = await move_once(label, ('left', 'right') if dual else ('left',), reverse)
                            diagnostic = await diagnose()
                            assert any(abs(value.get('forward', 0)) > .4 for value in inputs), (world, label, 'new touch was ignored', diagnostic, errors)
                            if dual:
                                turn = await page.evaluate('MuzikazHouseExplorer.snapshot().player.yaw')
                                assert abs(turn - yaw) > .01, (world, label, 'look finger was ignored')
                            # A real building can block forward and reverse. Try
                            # all remaining directions before reporting a freeze.
                            escapes = []
                            if ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 <= .1:
                                end = await move_once(label + ' reverse', reverse=not reverse)
                                escapes.append({'direction':'reverse','position':end})
                            if ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 <= .1:
                                for direction in [(-1,0),(1,0),(-1,-1),(1,-1),(-1,1),(1,1)]:
                                    end = await move_once(label + ' escape', direction=direction)
                                    escapes.append({'direction':direction,'position':end})
                                    if ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 > .1:
                                        break
                            diagnostic = await diagnose()
                            diagnostic['escapeAttempts'] = escapes
                            phase_traces.append({'phase':label,'start':start,'end':end,'diagnostic':diagnostic})
                            Path('/tmp/mobile-touch-'+world+'-diagnostic.json').write_text(json.dumps(phase_traces))
                            if ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 <= .1:
                                Path('/tmp/mobile-touch-failed-diagnostic.json').write_text(json.dumps(diagnostic))
                                await page.screenshot(path='/tmp/mobile-touch-failed.png')
                            assert ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 > .1, (world, label, 'view stopped responding', start, end, diagnostic, errors)
                            assert not await page.locator('.thumbstick-base.is-active').count(), (world, label, 'release left controller captured')

                        # Repeated alternating gestures stay in a clear corridor;
                        # dual gestures exercise distinct fingers on both sticks.
                        for index in range(8):
                            await drag('sustained ' + str(index), reverse=index % 2 == 1, dual=index in (2, 3))
                        if os.environ.get('MUZIKAZ_TOUCH_REPRO_ONLY') == '1':
                            print(world + ': sustained-only diagnostic saved at /tmp/mobile-touch-' + world + '-diagnostic.json', flush=True)
                            await page.close()
                            continue

                        # Use actual touch taps on the overlays that used to trap
                        # keyboard focus, then continue with a new finger gesture.
                        for open_name, close_name in [
                            ('Residents, conversations and daily objectives', 'Close resident conversations'),
                            ('Crew radio and vehicle quests', 'Close crew radio'),
                        ]:
                            await page.get_by_role('button', name=open_name, exact=True).tap()
                            await page.get_by_role('button', name=close_name, exact=True).tap()
                            await drag('after ' + open_name, reverse=True)
                        mini = page.locator('.live-local-map [data-collapse]')
                        await mini.tap()
                        await mini.tap()
                        await drag('after mini map')
                        await page.locator('.district-map-toggle').tap()
                        await page.locator('.district-map-dialog').get_by_role('button', name='Close', exact=True).tap()
                        await drag('after detailed map', reverse=True)

                        async def discard_terminal_events():
                            await page.evaluate('''() => {
                                window.discardTouchEnd = event => event.stopImmediatePropagation();
                                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
                                    window.addEventListener(type, discardTouchEnd, true);
                            }''')
                            await touch('touchEnd', [])
                            await page.wait_for_timeout(80)
                            await page.evaluate('''() => {
                                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
                                    window.removeEventListener(type, discardTouchEnd, true);
                                delete window.discardTouchEnd;
                            }''')

                        # A browser may discard the end of a gesture. The next
                        # primary finger must recover without reloading the page.
                        await begin()
                        await discard_terminal_events()
                        await drag('after missing terminal events', reverse=True)
                        await begin(('left', 'right'))
                        await discard_terminal_events()
                        await drag('after both fingers lost terminal events', reverse=True, dual=True)

                        # Backgrounding is delivered as visibility/page lifecycle
                        # events, and need not include a window blur on mobile.
                        await begin(('left', 'right'))
                        await discard_terminal_events()
                        await page.evaluate('''() => {
                            Object.defineProperty(document, 'hidden', {configurable:true, value:true});
                            document.dispatchEvent(new Event('visibilitychange'));
                            delete document.hidden;
                            document.dispatchEvent(new Event('visibilitychange'));
                        }''')
                        assert not await page.locator('.thumbstick-base.is-active').count(), (world, 'suspension retained private pointer state')
                        await drag('after visibility suspension', reverse=True, dual=True)
                        await begin(('left', 'right'))
                        await discard_terminal_events()
                        await page.evaluate("window.dispatchEvent(new Event('pagehide'))")
                        assert not await page.locator('.thumbstick-base.is-active').count(), (world, 'pagehide retained private pointer state')
                        await drag('after pagehide', reverse=True)

                        await begin(('left', 'right'))
                        await touch('touchCancel', [])
                        await drag('after native touch cancellation', reverse=True)
                        async with page.expect_response(lambda response: '/gameplay' in response.url and response.request.method == 'POST' and response.request.post_data_json.get('action') == 'fire') as fired:
                            await page.locator('.rad-tox-fire-trigger').tap()
                        assert (await fired.value).ok, (world, 'tools stopped after interrupted gestures')
                        assert await page.evaluate('MuzikazHouseExplorer.snapshot().serverReady'), (world, 'room disconnected')
                        assert not errors, (world, errors)
                        print(world + ': sustained touch, simultaneous sticks, panels/maps, lost-release recovery, visibility, pagehide, cancellation and firing passed.', flush=True)
                        await page.close()
                    await browser.close()
            except BaseException:
                room_file = Path(directory) / 'shared-rooms.json'
                if room_file.exists():
                    shutil.copyfile(room_file, '/tmp/mobile-touch-failed-shared-rooms.json')
                raise
            finally:
                server.terminate()
                server.wait(timeout=15)


asyncio.run(main())
