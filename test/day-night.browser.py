"""Render the local-clock sky and lighting in a non-UTC browser timezone."""
from base64 import b64decode
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--enable-unsafe-swiftshader'],
        )
        context = browser.new_context(timezone_id='America/Los_Angeles')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text)
                if message.type == 'error' and 'favicon' not in message.text else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        result = page.evaluate('''async () => {
          const THREE = await import('/public/vendor/three/three.module.min.js');
          const {getDayNightState} = await import('/public/js/day-night-cycle.js');
          const {createDayNightLighting} = await import('/public/js/environments/day-night-lighting.js');
          const {createOutdoorScenery} = await import('/public/js/environments/outdoor-scenery.js');
          const check = (condition, message) => { if (!condition) throw Error(message); };
          const noonInCalifornia = getDayNightState(new Date('2026-01-15T20:00:00Z'));
          check(noonInCalifornia.localHour === 12 && noonInCalifornia.isDay,
                'The cycle must use the player computer timezone, rather than UTC');

          const scene = new THREE.Scene();
          scene.fog = new THREE.Fog(0x050807, 36, 180);
          const hemi = new THREE.HemisphereLight(0xe6f7ff, 0x26321b, 1.75);
          const fill = new THREE.DirectionalLight(0xbfe7ff, .8);
          const sun = new THREE.DirectionalLight(0xfff4dc, 2.45);
          sun.position.set(12, 18, 8);
          scene.add(hemi, fill, sun);
          const baseline = [hemi.intensity, fill.intensity, sun.intensity];
          let computerTime = new Date(2026, 0, 15, 12);
          const lighting = createDayNightLighting({scene, hemi, fill, sun, now: () => computerTime});
          const scenery = createOutdoorScenery({scene});
          const environment = {id: 'public-commons', builderScene: {mapSize: 256}};
          lighting.setEnvironment(environment);
          scenery.setEnvironment(environment, lighting.state);

          const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
          renderer.setSize(320, 200);
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          document.body.append(renderer.domElement);
          const camera = new THREE.PerspectiveCamera(55, 1.6, .05, 700);
          const anchor = new THREE.Vector3(0, 0, 0);
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
              new THREE.MeshStandardMaterial({color: 0xdddddd, roughness: .9}));
          sphere.position.y = 1;
          const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
              new THREE.MeshStandardMaterial({color: 0x8ba674, roughness: 1}));
          ground.rotation.x = -Math.PI / 2;
          scene.add(sphere, ground);
          const gl = renderer.getContext();
          function luminance() {
            const pixel = new Uint8Array(4);
            gl.readPixels(160, 100, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return .2126 * pixel[0] + .7152 * pixel[1] + .0722 * pixel[2];
          }
          function render() {
            scenery.update(0, camera, lighting.state);
            renderer.render(scene, camera);
            return luminance();
          }
          const samples = [], snapshots = {};
          for (const hour of [0, 6, 12, 18]) {
            computerTime = new Date(2026, 0, 15, hour);
            lighting.update(anchor);
            const state = lighting.state;
            check(state.localHour === hour, 'Clock changes must be reflected by the next update');
            camera.position.set(0, 4, 9);
            camera.lookAt(0, 1, 0);
            const surface = render();
            check(Number.isFinite(surface), 'The scene must render at every transition');
            if (hour === 0 || hour === 12) snapshots[hour] = renderer.domElement.toDataURL('image/png');

            camera.position.set(0, 30, 0);
            camera.lookAt(0, 40, -100);
            const sky = render();
            const direction = hour === 0 ? state.moonDirection : state.sunDirection;
            let celestial = null, adjacent = null;
            if (hour === 0 || hour === 12) {
              const aim = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
              camera.lookAt(camera.position.clone().addScaledVector(aim, 100));
              celestial = render();
              const tangent = new THREE.Vector3().crossVectors(aim, new THREE.Vector3(0, 0, 1)).normalize();
              const beside = aim.clone().addScaledVector(tangent, .18).normalize();
              camera.lookAt(camera.position.clone().addScaledVector(beside, 100));
              adjacent = render();
              check(celestial > adjacent, hour === 0
                ? 'The midnight moon must shine brighter than the surrounding sky'
                : 'The midday sun must shine brighter than the surrounding sky');
            }
            samples.push({hour, phase: state.phase, surface, sky, celestial, adjacent});
          }
          const midnight = samples.find(sample => sample.hour === 0);
          const noon = samples.find(sample => sample.hour === 12);
          check(noon.surface > midnight.surface, 'Daytime surfaces must be brighter than nighttime surfaces');
          check(midnight.surface > 0, 'Moonlight must keep nighttime surfaces visible');
          check(noon.sky > midnight.sky, 'The night sky must be darker than the day sky');

          computerTime = new Date(2026, 0, 15, 0);
          lighting.setEnvironment({id: 'interior', indoor: true});
          scenery.setEnvironment({id: 'interior', indoor: true}, lighting.state);
          lighting.update(anchor);
          check(!scenery.profile && !scene.getObjectByName('WEATHER_SKY_SPHERE'),
                'Outdoor celestial bodies must be removed on entering an interior');
          check([hemi.intensity, fill.intensity, sun.intensity].every((value, index) => value === baseline[index]),
                'An indoor transition must restore authored interior light levels');

          scenery.dispose();
          lighting.dispose?.();
          sphere.geometry.dispose(); sphere.material.dispose();
          ground.geometry.dispose(); ground.material.dispose();
          renderer.dispose();
          return {samples, snapshots};
        }''')
        assert not errors, errors
        for hour, data in result.pop('snapshots').items():
            label = 'midnight' if hour == '0' else 'noon'
            Path(f'/tmp/muzikaz-day-night-{label}.png').write_bytes(b64decode(data.split(',', 1)[1]))
        print(json.dumps(result, indent=2))
        print('Local-clock dawn, noon, dusk and midnight render correctly; sun and moon shine; indoor lighting is restored.')
        browser.close()
finally:
    server.shutdown()
