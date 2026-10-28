#!/usr/bin/env python3
"""Create a standalone HTML report from measured pressure-test JSON artifacts."""
import argparse
import html
import io
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def esc(value):
    return html.escape(str(value))


def number(value, places=1):
    return '—' if value is None else f'{value:,.{places}f}'


def percent(value):
    return '—' if value is None else number(value * 100) + '%'


def simulation_rss(stage):
    value = stage.get('memory', {}).get('peakSampledRssBytes', stage.get('peakSampledRssBytes'))
    return None if value is None else value / 1048576


def active_count(occupancy):
    rooms = occupancy.get('rooms', [])
    responding = [room for room in rooms if room.get('status') == 200]
    if not rooms:
        return '—'
    if not responding:
        return 'unavailable'
    count = str(sum(room.get('activeHumans', 0) for room in responding))
    return count if len(responding) == len(rooms) else count + ' observed; partial response'


def table(headers, rows):
    return '<div class="scroll"><table><thead><tr>' + ''.join(
        '<th>' + esc(header) + '</th>' for header in headers
    ) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(
        '<td>' + esc(cell) + '</td>' for cell in row
    ) + '</tr>' for row in rows) + '</tbody></table></div>'


def chart(stages):
    measured = [stage for stage in stages if stage.get('inputLatencyMs', {}).get('p95') is not None]
    if not measured:
        return ''
    plt.rcParams.update({'font.size': 9, 'svg.fonttype': 'none'})
    fig, axes = plt.subplots(2, 1, figsize=(12, 7), sharex=True, constrained_layout=True)
    labels = [stage['name'] for stage in measured]
    axes[0].bar(labels, [stage['inputLatencyMs']['p95'] for stage in measured],
                color=['#28654a' if stage.get('pass') else '#b25325' for stage in measured])
    axes[0].axhline(100, color='#535967', linestyle='--', label='Chosen p95 target: 100 ms')
    axes[0].set_ylabel('Input response p95 (ms)')
    axes[0].set_yscale('log')
    axes[0].legend(loc='upper left')
    axes[1].bar(labels, [stage.get('deliveredSlotRatio', 0) * 100 for stage in measured], color='#375e8a')
    axes[1].axhline(95, color='#535967', linestyle='--', label='Chosen delivery target: 95%')
    axes[1].set_ylabel('Successful / offered input slots (%)')
    axes[1].set_ylim(0, 105)
    axes[1].legend(loc='lower left')
    axes[1].tick_params(axis='x', labelrotation=65)
    for axis in axes:
        axis.spines[['top', 'right']].set_visible(False)
        axis.grid(axis='y', alpha=.15)
    stream = io.StringIO()
    fig.savefig(stream, format='svg')
    plt.close(fig)
    return '<svg' + stream.getvalue().split('<svg', 1)[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--http', action='append', required=True, type=Path)
    parser.add_argument('--storage', type=Path)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--simulation', type=Path)
    parser.add_argument('--admission', type=Path)
    parser.add_argument('--ledger-repro', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    reports = [json.loads(path.read_text()) for path in args.http]
    storage = json.loads(args.storage.read_text()) if args.storage else None
    baseline = json.loads(args.baseline.read_text()) if args.baseline else None
    simulation = json.loads(args.simulation.read_text()) if args.simulation else None
    admission = json.loads(args.admission.read_text()) if args.admission else None
    ledger_repro = json.loads(args.ledger_repro.read_text()) if args.ledger_repro else None
    latest_stages = {}
    for report in reports:
        for stage in report.get('scenarios', []):
            latest_stages[stage['name']] = stage
    stages = list(latest_stages.values())
    cutoff_names = {item.get('scenario') for report in reports for item in report.get('interventions', [])}
    rows = []
    for stage in stages:
        timing = stage.get('inputLatencyMs', stage.get('latencyMs', {}))
        measured_input = stage.get('inputLatencyMs', {}).get('count', 0) > 0
        rows.append([
            stage['name'], stage.get('requestedPlayers', stage.get('requested', '—')),
            stage.get('joinedPlayers', stage.get('successful', '—')),
            active_count(stage.get('occupancyBefore', {})) + ' / ' + active_count(stage.get('occupancyAfter', {})),
            stage.get('rooms', '—'), number(timing.get('p50')), number(timing.get('p95')),
            number(timing.get('p99')), number(stage.get('successfulRequestsPerSecond')) if measured_input or stage.get('kind') == 'login' else 'not measured',
            percent(stage.get('deliveredSlotRatio')) if measured_input else 'not measured',
            number(stage.get('server', {}).get('rssMiB', {}).get('max')),
            'EXPERIMENT CUTOFF' if stage.get('stageTimedOut') or stage['name'] in cutoff_names else 'PASS' if stage.get('pass') else 'OUTSIDE TARGET',
        ])
    content = '<h1>MUZIKAZ server pressure test</h1>'
    content += '<p>Measured local HTTP gameplay, persistence contention, and restart recovery. '
    content += 'All accounts, maps, sessions and economic activity are synthetic and isolated.</p>'
    content += '<p><strong>This is a single-machine capacity experiment, not a production capacity certification.</strong> '
    content += 'The HTTP client and server share the execution machine. No WAN latency, real GPU rendering, '
    content += 'headset behavior, blockchain settlement, or multi-region infrastructure is benchmarked.</p>'
    if any(report.get('executionInterrupted') for report in reports):
        content += '<p>The first HTTP batch was interrupted externally; completed scenarios were retained, and requested scale targets '
        content += 'and remaining feature checks continued in new batches. The interrupted 32-player and unrun 64-player intermediate '
        content += 'public-world ramps are excluded from capacity claims. Experiment time cutoffs are identified separately from spontaneous crashes. '
        content += 'For repeated scenarios, the table uses the latest corrected run; all batches remain in the raw data below.</p>'
    gameplay = [stage for stage in stages if stage.get('kind') != 'login']
    content += '<p><strong>' + str(sum(bool(stage.get('pass')) for stage in gameplay)) + ' of ' + str(len(gameplay))
    content += ' attempted HTTP gameplay scenarios met the chosen targets.</strong> Interrupted or deadline-limited stages '
    content += 'are identified in their batch metadata. A successful join alone does not establish smooth gameplay.</p>'
    target_rows = []
    world = next((stage for stage in reversed(stages) if stage['name'] == 'commons-128'), None)
    if world:
        world_evidence = ('Joined ' + str(world.get('joinedPlayers', '—')) + '; p95 ' + number(world.get('inputLatencyMs', {}).get('p95')) +
            ' ms; delivered slots ' + percent(world.get('deliveredSlotRatio')))
        if world.get('stageTimedOut') and not world.get('inputLatencyMs', {}).get('count'):
            world_evidence = ('Admission incomplete within batch stage wall budget; ' + str(world.get('joinedPlayers', '—')) +
                ' joins acknowledged; steady-state input test not reached')
        target_rows.append(['128 in one public world', 'Actual authenticated HTTP path',
            'Met chosen targets' if world.get('pass') else 'Did not meet chosen targets',
            world_evidence])
    if simulation:
        for target in (1000, 10000):
            stage = next((stage for stage in simulation.get('scenarios', []) if stage['scenario']['players'] == target), None)
            if stage:
                observed = stage.get('completedTicks', 0)
                timing_label = 'Tick p95 ' if observed >= 5 else 'Single observed tick ' if observed == 1 else 'Observed tick p95 '
                target_rows.append([f'{target:,} across worlds', 'Synthetic gameplay simulation only',
                    'End-to-end player capacity remains unvalidated',
                    timing_label + number(stage.get('tickWallMs', {}).get('p95')) + ' ms; completed ticks ' + str(observed) + '; 50 ms deadline hits ' +
                    percent(stage.get('deadline50ms', {}).get('hitRatio')) + '; ' + stage['status']])
    if target_rows:
        content += '<h2>Requested scale targets</h2>' + table(['Target', 'What was exercised', 'Assessment', 'Evidence'], target_rows)
    content += '<h2>HTTP gameplay results</h2><p>The offered input rate is 20 slots per second per player. '
    content += 'Each client has bounded in-flight work; missed slots remain in the denominator. '
    content += 'The chosen engineering targets are p95 ≤100 ms, p99 ≤250 ms, ≥95% successful slot delivery, '
    content += 'and <1% unexpected request errors. These are assessment criteria, not measured industry standards.</p>'
    content += chart(stages)
    content += '<p>Join successes count admissions during setup. The active-before/after column checks simultaneous presence; '
    content += 'lease expiry under load can reduce it. Response latency includes completed error/timeout attempts, and delivered slots '
    content += 'count successful responses received within the stage deadline.</p>'
    content += table(['Scenario', 'Requested', 'Joined / successful', 'Active before / after', 'Rooms', 'p50 ms', 'p95 ms', 'p99 ms',
                      'Successful req/s', 'Delivered slots', 'Peak server RSS MiB', 'Assessment'], rows)
    for path, report in zip(args.http, reports):
        content += '<h2>' + esc(path.stem) + ': environment and recovery</h2>'
        content += '<pre>' + esc(json.dumps({'environment': report.get('environment'),
            'sourceCommit': report.get('sourceCommit'), 'syntheticAccounts': report.get('syntheticAccounts'),
            'recovery': report.get('recovery'), 'failures': report.get('failures'),
            'executionInterrupted': report.get('executionInterrupted'), 'scopeNote': report.get('scopeNote'),
            'interventions': report.get('interventions'),
            'startedAt': report.get('startedAt'), 'finishedAt': report.get('finishedAt')}, indent=2)) + '</pre>'
        for stage in report.get('scenarios', []):
            if stage.get('errors') or stage.get('capacityGuard') or stage.get('sideTraffic', {}).get('requests'):
                content += '<details><summary>' + esc(stage['name']) + ': errors, admission and mixed traffic</summary><pre>'
                content += esc(json.dumps({key: stage.get(key) for key in ['errors', 'capacityGuard', 'occupancyBefore', 'occupancyAfter', 'sideTraffic']}, indent=2)) + '</pre></details>'
    if storage:
        content += '<h2>Persistence pressure</h2><p>Stored users and worlds are synthetic dataset sizes, '
        content += 'not concurrent connected players. Room tick timings cover storage cloning and queues, '
        content += 'not a complete gameplay simulation.</p>'
        content += table(['Correctness invariant', 'Result'], [
            [check['name'], check['status']] for check in storage.get('correctness', [])])
        content += table(['Stored users / rooms', 'Workload', 'Concurrency', 'Ops/s', 'p95 ms', 'p95 queue ms', 'Result'], [
            [str(growth['scale']['users']) + ' / ' + str(growth['scale']['storedRooms']), workload['name'],
             workload['concurrency'], number(workload['operationsPerSecond']), number(workload['latencyMs']['p95']),
             number(workload['queueWaitMs']['p95']), workload['status']]
            for growth in storage.get('growth', []) for workload in growth.get('workloads', [])])
    if baseline:
        content += '<h2>Functional regression run</h2><pre>' + esc(json.dumps(baseline, indent=2)) + '</pre>'
    if ledger_repro:
        content += '<h2>Mixed gameplay balance-check limitation</h2><p>The original mixed-stage check compared the ending balance only '
        content += 'with acknowledged debits. It omitted automatic gameplay credits, so its false flag is not proof of a lost debit. '
        content += 'The original ledger was not retained, and that particular net change remains unreconciled. A separate real-HTTP '
        content += 'reproduction recorded two one-token debits and a one-token automatic coin pickup: 2,000 − 1 − 1 + 1 = 1,999. '
        content += 'Both distinct spend receipts and the credit reconcile. The mixed stage independently failed latency and input-delivery '
        content += 'targets. Future harness runs capture signed ledger changes and verify acknowledged spend IDs.</p>'
        content += '<details><summary>Focused ledger reproduction</summary><pre>' + esc(json.dumps(ledger_repro, indent=2)) + '</pre></details>'
    if simulation:
        content += '<h2>1,000 and 10,000 player simulation targets</h2><p>These are unique synthetic active players in the actual gameplay simulation, '
        content += 'spread across light park rooms. They are not authenticated HTTP clients. No network snapshots, disk writes or authentication run during these tick timings. '
        content += 'Twenty measured ticks represent one simulated second; this is a compute-budget check, not a sustained-user qualification.</p>'
        content += '<p>A one-tick partial result is a single observation, not a reliable percentile estimate.</p>'
        content += table(['Synthetic players', 'Rooms', 'Completed ticks', 'p50 tick ms', 'p95 tick ms', 'Max observed tick ms', '50 ms deadline hit rate', 'Peak sampled RSS MiB', 'Status'], [
            [stage['scenario']['players'], stage['scenario']['roomCount'],
             str(stage.get('completedTicks', 0)) + ' / ' + str(stage.get('requestedTicks', simulation['options']['ticks'])),
             number(stage.get('tickWallMs', {}).get('p50')) if stage.get('completedTicks', 0) >= 2 else 'insufficient samples',
             number(stage.get('tickWallMs', {}).get('p95')) if stage.get('completedTicks', 0) >= 2 else 'insufficient samples',
             number(stage.get('tickWallMs', {}).get('max')),
             percent(stage.get('deadline50ms', {}).get('hitRatio')),
             number(simulation_rss(stage)), stage['status']]
            for stage in simulation.get('scenarios', [])])
        content += '<details><summary>Simulation methods and raw measurements</summary><pre>' + esc(json.dumps(simulation, indent=2)) + '</pre></details>'
    if admission:
        content += '<h2>1,000 and 10,000 cold-login pressure targets</h2><p>Offered attempts arrive over 20 seconds, '
        content += 'with 128 requests maximum in flight. Attempts exceeding that cap are counted as dropped. '
        content += 'Accepted logins do not demonstrate concurrently active gameplay.</p>'
        content += table(['Offered attempts', 'Issued', 'Not issued (client cap)', 'Authenticated by deadline', 'Eventually authenticated', 'Admissions/s within deadline', 'p95 request ms', 'Status'], [
            [stage.get('offeredAttempts'), stage.get('attemptsIssued'), stage.get('droppedSlots'),
             stage.get('authenticatedByDeadline'), stage.get('authenticatedAdmissions'),
             number(stage.get('authenticatedAdmissionsPerSecond')), number(stage.get('requestLatencyMs', {}).get('p95')),
             'PASS' if stage.get('pass') else 'OUTSIDE TARGET'] for stage in admission.get('stages', [])])
        content += '<details><summary>Admission methods and raw measurements</summary><pre>' + esc(json.dumps(admission, indent=2)) + '</pre></details>'
    content += '<h2>What needs to change before larger player targets</h2><ul>'
    content += '<li>For one busy world: profile the command path, separate simulation from request handling, coalesce inputs, '
    content += 'and send compact relevant state on a controlled schedule.</li>'
    content += '<li>For many worlds: route rooms to independent workers and move shared accounts, sessions and economic state '
    content += 'to coordinated storage with transactional updates and idempotent receipts.</li>'
    content += '<li>For launch bursts: move expensive credential derivation off the main event loop and add bounded admission queues.</li>'
    content += '<li>Repeat sustained end-to-end tests on production-equivalent infrastructure before setting public capacity promises.</li></ul>'
    content += '<h2>Reproduce</h2><pre>node scripts/pressure-test-server.mjs --profile=full --duration=20 --output=work/server-pressure/http.json\n'
    content += 'node scripts/pressure-test-storage.mjs --suite=all --scales=1,100,1000,10000 --operations=50 --concurrency=25 --output=work/server-pressure/storage.json\n'
    content += 'node scripts/pressure-test-simulation.mjs --targets=1,15,128,1000,10000 --ticks=20 --warmup=3 --scenario-seconds=120 --memory-mb=1536 --output=work/server-pressure/simulation.json\n'
    content += 'node scripts/pressure-test-admission.mjs --profile=full --output=work/server-pressure/admission.json\n'
    content += 'python3 scripts/render-pressure-report.py --http work/server-pressure/http.json --storage work/server-pressure/storage.json --output work/server-pressure/report.html</pre>'
    for path, report in zip(args.http, reports):
        content += '<details><summary>Raw HTTP measurements: ' + esc(path.name) + '</summary><pre>'
        content += esc(json.dumps(report, indent=2)) + '</pre></details>'
    document = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    document += '<title>MUZIKAZ server pressure test</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#202b36;background:#f1f4f6;margin:0}'
    document += 'main{max-width:1280px;margin:32px auto;background:white;padding:32px;border-radius:16px}h1{line-height:1.2}h2{margin-top:32px}'
    document += 'table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px;text-align:left;border-bottom:1px solid #dce2e7}'
    document += 'th{background:#eef2f5;white-space:nowrap}.scroll{overflow:auto}pre{padding:16px;background:#eff3f6;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}'
    document += 'svg{max-width:100%;height:auto}summary{cursor:pointer;padding:10px}details{border:1px solid #dce2e7;margin:12px 0}@media(max-width:600px){main{margin:0;padding:16px}}</style><main>'
    document += content + '</main></html>'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(document)
    print(args.output)


if __name__ == '__main__':
    main()
