"""Casino profile, task actions, bounded chatter and live draft retention."""
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
        page = browser.new_page(viewport={'width':390, 'height':844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/casino-conversations.html')
        page.wait_for_function('window.ready')
        page.get_by_role('button', name='Residents, conversations and daily objectives', exact=True).click()
        assert 'Warm organizer' in page.locator('.casino-resident-card').first.inner_text()
        assert 'guesthouse' in page.locator('.casino-contact-profile').inner_text()
        assert page.locator('[data-casino-chatter] li').count() == 8
        # Live activity and skill updates must keep the same clickable node,
        # including while a visitor has the button focused or pressed.
        contact = page.get_by_role('button', name='Start conversation with Amira Lane', exact=True)
        contact.scroll_into_view_if_needed()
        contact.focus()
        page.evaluate("window.originalContact=document.querySelector('[data-resident-talk=host]')")
        box = contact.bounding_box()
        page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
        page.mouse.down()
        page.evaluate("for(let index=0;index<25;index++){state.actors.host.resident.task='Live casino activity '+index;state.actors.host.resident.skills.social+=.1;state.actors.host.resident.speech='Reply '+index;ui.update(state,'me','muzikaz-casino');}window.stableContact=originalContact===document.querySelector('[data-resident-talk=host]')&&originalContact.isConnected&&document.activeElement===originalContact")
        assert page.evaluate('stableContact')
        page.mouse.up()
        page.wait_for_function("commands.at(-1)?.choice==='day'")
        page.evaluate("window.originalReply=document.querySelector('[data-casino-reply=casino-task]');for(let index=0;index<25;index++){state.actors.host.resident.task='Thinking about the floor '+index;state.actors.host.resident.goal.reason='Welcome guest '+index;ui.update(state,'me','muzikaz-casino');}window.stableReply=originalReply===document.querySelector('[data-casino-reply=casino-task]')&&originalReply.isConnected")
        assert page.evaluate('stableReply')
        reply = page.get_by_label('Choose quest conversation reply', exact=True)
        reply.select_option('casino-skills')
        question = page.get_by_label('Question for resident', exact=True)
        question.fill('I enjoy poker and want to learn')
        question.evaluate('(node)=>node.setSelectionRange(8,13)')
        page.evaluate("state.actors.host.resident.task='guiding a guest';state.players.me.npcConversation.casino.activity='guiding a guest';ui.update(state,'me','muzikaz-casino')")
        assert question.input_value() == 'I enjoy poker and want to learn'
        assert question.evaluate('(node)=>node===document.activeElement&&node.selectionStart===8&&node.selectionEnd===13')
        assert reply.input_value() == 'casino-skills'
        question.press('Enter')
        page.wait_for_function("commands.at(-1)?.text==='I enjoy poker and want to learn'")
        assert page.evaluate("commands.at(-1).choice==='question'")
        assert 'interest in poker' in page.locator('.casino-contact-memory').inner_text()
        page.locator('[data-casino-reply="casino-task"]').click()
        assert page.get_by_label('Casino staff task offer').is_visible()
        page.locator('[data-casino-reply="casino-accept"]').click()
        assert page.locator('[data-casino-task]').is_visible()
        assert 'Step 1 of 2' in page.locator('[data-casino-task-title]').inner_text()
        page.locator('[data-casino-confirm]').click()
        assert page.evaluate("commands.at(-1).choice==='casino-confirm'")
        assert 'Step 2 of 2' in page.locator('[data-casino-task-title]').inner_text()
        page.locator('[data-casino-confirm]').click()
        assert '8 reputation' in page.locator('[data-casino-progress]').inner_text()
        assert 'Floor guide badge' in page.locator('[data-casino-badges]').inner_text()
        page.locator('[data-casino-reply="casino-accept"]').click()
        page.locator('[data-casino-cancel]').click()
        assert page.evaluate("commands.at(-1).choice==='casino-cancel'")
        for width, height in [(390,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height})
            panel = page.locator('.world-resident-panel')
            assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
            box = panel.bounding_box()
            assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1, box
        page.get_by_role('button',name='Close resident conversations',exact=True).click()
        page.evaluate('ui.dispose()')
        assert not errors, errors
        browser.close()
    print('Casino profile, task offer/accept/confirm/cancel, reputation, bounded chatter, live draft/caret and mobile layout pass.')
finally:
    server.shutdown()
