from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])

class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  page = browser.new_page()
  errors = []
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  page.evaluate('''async () => {
   const {mountPlayerSettings} = await import('/public/js/player-settings.js');
   document.body.replaceChildren();
   const panel = document.createElement('main'); document.body.append(panel);
   window.savedAudioSettings = {introductionMuted:true, effectsVolume:79};
   const inventory = {
    async api(path, options) { if (options?.method === 'PUT') window.savedAudioSettings = JSON.parse(options.body).settings; return {owner_id:'member', settings:window.savedAudioSettings}; },
    async session() { return {owner_id:'member', csrfToken:'test'}; },
    async state() { return {owner_id:'member', balance:0, items:[], stats:{}, history:[]}; }
   };
   window.settingsUI = mountPlayerSettings({panel, inventory, onChange:value=>window.previewAudioSettings=value, gameState:()=>({}), onAvatar(){}, onCare(){}});
   await window.settingsUI.open();
  }''')
  assert page.get_by_role('button', name='Mute world introduction', exact=True).get_attribute('aria-pressed') == 'true'
  for label in ['Mute all audio', 'Mute new jobs & map announcements', 'Mute npc conversations', 'Mute game effects', 'Mute shared media']:
   button = page.get_by_role('button', name=label, exact=True)
   assert button.get_attribute('aria-pressed') == 'false'
   button.click()
   assert button.get_attribute('aria-pressed') == 'true'
  spatial = page.get_by_role('button', name='Spatial audio', exact=True)
  spatial.focus(); page.keyboard.press('Space')
  assert spatial.get_attribute('aria-pressed') == 'false'
  assert page.evaluate('window.previewAudioSettings.effectsVolume') == 79
  page.get_by_role('button', name='Save settings', exact=True).click()
  page.wait_for_function("document.querySelector('[data-settings-status]').textContent === 'Saved to your member account.'")
  assert page.evaluate('window.savedAudioSettings.masterMuted && window.savedAudioSettings.mediaMuted && !window.savedAudioSettings.spatialAudio')
  page.get_by_role('button', name='Reset preferences', exact=True).click()
  assert page.get_by_role('button', name='Mute all audio', exact=True).get_attribute('aria-pressed') == 'false'
  assert spatial.get_attribute('aria-pressed') == 'true'
  page.evaluate('async () => { window.settingsUI.close(); await window.settingsUI.open(); }')
  assert page.get_by_role('button', name='Mute all audio', exact=True).get_attribute('aria-pressed') == 'true'
  assert spatial.get_attribute('aria-pressed') == 'false'
  assert page.evaluate('window.previewAudioSettings.effectsVolume') == 79
  assert not errors, errors
  page.evaluate('window.settingsUI.close()')
  browser.close()
  print('Audio settings toggles, keyboard access, preview, save, reset and restore passed.')
finally:
 server.shutdown()
