"""Verify desktop map travel and mobile entry into the shared firing range.

Run against an already running local server with isolated, disposable game data:

    python3 test/firing-range-entry.browser.py --origin http://127.0.0.1:3000

Requires Python Playwright and Chromium. The test creates two guest sessions,
starts open practice, and fires scored shots; do not use a production server.
Screenshots are saved under --artifacts (default: work/firing-range-entry-browser).
"""

import argparse
import json
from pathlib import Path
import uuid

from playwright.sync_api import sync_playwright


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:3000")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--range", choices=["firing-range", "force-training-range"], default="firing-range")
    parser.add_argument(
        "--artifacts", type=Path, default=Path("work/firing-range-entry-browser")
    )
    return parser.parse_args()


def create_guest(context, origin):
    response = context.request.post(f"{origin}/api/access/guest", data={})
    assert response.ok, f"Guest access failed: HTTP {response.status}"


def range_command(context, origin, action, range_id="firing-range"):
    session = context.request.get(f"{origin}/api/game/room-session")
    assert session.ok, f"Room session failed: HTTP {session.status}"
    csrf_token = session.json()["data"]["csrfToken"]
    response = context.request.post(
        f"{origin}/api/rooms/{range_id}/gameplay",
        data={"action": action, "requestId": str(uuid.uuid4())},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.ok, f"{action} failed: HTTP {response.status}: {response.text()[:300]}"
    return response.json()["data"]


def score(page):
    return page.locator("[data-self-score]").evaluate(
        "el => Number(el.textContent.replace(/[^0-9]/g, ''))"
    )


def wait_for_score_increase(page, previous_score):
    page.wait_for_function(
        "previous => Number(document.querySelector('[data-self-score]')"
        ".textContent.replace(/[^0-9]/g, '')) > previous",
        arg=previous_score,
        timeout=10000,
    )


def wait_for_game_start(page):
    page.wait_for_function(
        "document.querySelector('#house-game-start')?.classList.contains('is-hidden')",
        timeout=30000,
    )


def main():
    args = parse_args()
    origin = args.origin.rstrip("/")
    args.artifacts.mkdir(parents=True, exist_ok=True)
    browser_errors = []
    commands = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=args.chromium,
            headless=True,
            args=["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
        )
        try:
            desktop_context = browser.new_context(
                viewport={"width": 1360, "height": 900}, ignore_https_errors=True
            )
            create_guest(desktop_context, origin)
            desktop = desktop_context.new_page()
            desktop.on("pageerror", lambda error: browser_errors.append(str(error)))

            def record_range_command(request):
                if (
                    request.url.endswith(f"/api/rooms/{args.range}/gameplay")
                    and request.method == "POST"
                ):
                    commands.append(json.loads(request.post_data)["action"])

            desktop.on("request", record_range_command)
            desktop.goto(
                f"{origin}/model-explorer.html?environment=basketball-arena&autoplay=1",
                wait_until="domcontentloaded",
            )
            desktop.wait_for_function(
                "document.querySelector('.game-live-connection')"
                "?.textContent.toLowerCase().includes('basketball arena')",
                timeout=45000,
            )
            wait_for_game_start(desktop)
            desktop.locator("#house-world-button").click()
            desktop.locator("[data-world-search]").fill("Force Training" if args.range == "force-training-range" else "MUZIKAZ Live Firing Range")
            desktop.locator("[data-world-join]").click()
            desktop.wait_for_selector(".firing-range-hud:not([hidden])", timeout=45000)
            if not desktop.locator(".firing-range-panel").is_visible():
                desktop.locator("[data-range-open]").click()

            assert "range-ready" in commands, f"Range entry commands: {commands}"
            assert "This map runs live firing range tournaments." not in desktop.locator(
                "body"
            ).inner_text()
            wait_for_game_start(desktop)
            desktop.screenshot(path=str(args.artifacts / "desktop-range-lobby.png"))

            practice = desktop.locator(
                '.firing-range-panel [data-range-action="range-practice"]'
            )
            if practice.is_enabled():
                practice.click()
            else:
                # A repeated run may find the isolated server's practice still live.
                desktop.locator(".firing-range-panel [data-range-close]").last.click()
            desktop.wait_for_function(
                "document.querySelector('[data-phase]')?.textContent === 'OPEN PRACTICE'",
                timeout=10000,
            )
            desktop.wait_for_selector(".firing-range-panel[open]", state="hidden", timeout=5000)
            desktop_before = score(desktop)
            desktop.locator('.firing-range-hud [data-range-action="range-fire"]').click()
            wait_for_score_increase(desktop, desktop_before)
            desktop_score = score(desktop)

            legacy_start = range_command(desktop_context, origin, "start-rad-tox", args.range)
            legacy_next = range_command(desktop_context, origin, "next-rad-tox", args.range)
            assert legacy_start["firingRange"]["matchId"] == legacy_next["firingRange"]["matchId"]
            assert legacy_start["firingRange"]["leaderboard"][0]["score"] > 0
            assert legacy_start["firingRange"]["leaderboard"] == legacy_next["firingRange"]["leaderboard"]
            desktop.screenshot(path=str(args.artifacts / "desktop-range-playing.png"))

            mobile_context = browser.new_context(
                viewport={"width": 390, "height": 844},
                is_mobile=True,
                has_touch=True,
                ignore_https_errors=True,
            )
            create_guest(mobile_context, origin)
            mobile = mobile_context.new_page()
            mobile.on("pageerror", lambda error: browser_errors.append(str(error)))
            # Old solo links must still enter the dedicated map's shared practice.
            mobile.goto(
                f"{origin}/model-explorer.html?environment={args.range}&mode=solo&autoplay=1",
                wait_until="domcontentloaded",
            )
            mobile.wait_for_selector(".firing-range-hud:not([hidden])", timeout=45000)
            wait_for_game_start(mobile)
            assert "Watching" not in mobile.locator("[data-caption]").inner_text()
            mobile_before = score(mobile)
            mobile.locator('.firing-range-hud [data-range-action="range-fire"]').tap()
            wait_for_score_increase(mobile, mobile_before)
            mobile_score = score(mobile)
            mobile.screenshot(path=str(args.artifacts / "mobile-range-playing.png"))

            assert not browser_errors, browser_errors
            print(
                json.dumps(
                    {
                        "desktop_map_list_entry": "passed",
                        "range_ready_confirmed": True,
                        "desktop_practice_score": desktop_score,
                        "legacy_start_resume": "passed",
                        "mobile_solo_link_shared_practice_score": mobile_score,
                        "browser_errors": browser_errors,
                    }
                ),
                flush=True,
            )
        except Exception:
            for name in ("desktop", "mobile"):
                page = locals().get(name)
                if page is None or page.is_closed():
                    continue
                try:
                    print(
                        json.dumps(
                            {
                                "failed_page": name,
                                "start_status": page.locator(
                                    "#house-game-load-status"
                                ).inner_text(timeout=3000),
                                "browser_errors": browser_errors,
                            }
                        ),
                        flush=True,
                    )
                    page.screenshot(
                        path=str(args.artifacts / f"{name}-failure.png"), timeout=5000
                    )
                except Exception:
                    pass
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
