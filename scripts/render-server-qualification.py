#!/usr/bin/env python3
"""Build a portable server qualification report from completed isolated runs."""
import argparse
import html
import io
import json
import shlex
from datetime import datetime
from pathlib import Path


def esc(value):
    return html.escape(str(value))


def num(value, digits=1):
    return '—' if value is None else f'{value:,.{digits}f}'


def pct(value):
    return '—' if value is None else num(value * 100) + '%'


def stamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M UTC')
    except (AttributeError, ValueError):
        return str(value or 'unavailable')


def load(path):
    return json.loads(path.read_text()) if path.exists() else None


def table(headers, rows):
    return '<div class="scroll"><table><thead><tr>' + ''.join(
        '<th scope="col">' + esc(value) + '</th>' for value in headers
    ) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(
        '<td>' + esc(value) + '</td>' for value in row
    ) + '</tr>' for row in rows) + '</tbody></table></div>'


def evidence(label, value):
    return '<details><summary>' + esc(label) + '</summary><pre>' + esc(
        json.dumps(value, ensure_ascii=False, indent=2)) + '</pre></details>'


def cutoff(stage, report):
    names = {item.get('scenario') for item in report.get('interventions', [])}
    return bool(stage.get('stageTimedOut') or stage.get('name') in names)


def measured(stage):
    return stage.get('inputLatencyMs', {}).get('count', 0) > 0


def verified(stage):
    return stage.get('joinedPlayers') == stage.get('requestedPlayers') and \
        stage.get('occupancyBefore', {}).get('allExpectedPresent') is True and \
        stage.get('occupancyAfter', {}).get('allExpectedPresent') is True


def complete(stage, report):
    return stage.get('kind') != 'login' and measured(stage) and verified(stage) and \
        not stage.get('error') and not cutoff(stage, report)


def qualified(stage, report):
    # Keep the harness's complete gate, including capacity, health, snapshots,
    # errors and ledger validation; latency alone must never imply a pass.
    return complete(stage, report) and stage.get('pass') is True


def presence(value):
    rooms = value.get('rooms', [])
    if not rooms:
        return 'not checked'
    replies = [room for room in rooms if room.get('status') == 200]
    if not replies:
        return 'unavailable'
    count = str(sum(room.get('activeHumans', 0) for room in replies))
    return count if len(replies) == len(rooms) else count + ' observed; partial replies'


def name(stage):
    key = stage.get('name', '')
    count = stage.get('requestedPlayers', stage.get('requested'))
    labels = {'builder': 'Builder', 'commons': 'Public commons', 'airport': 'Airport',
              'construction': 'Construction', 'hockey': 'Hockey', 'arcade': 'Arcade', 'login': 'Login burst'}
    label = 'Mixed activity' if key.startswith('mixed-') else 'Dense builder' if key.startswith('builder-dense-') else \
        'Builder room fleet' if key.startswith('multi-room-') else labels.get(stage.get('kind'), key)
    return label + (' · ' + str(count) if count is not None else '')


def assessment(stage, report):
    if cutoff(stage, report):
        return 'Unqualified: experiment cutoff'
    if stage.get('error'):
        return 'Incomplete: ' + stage['error']
    if stage.get('kind') == 'login':
        return 'All logins acknowledged' if stage.get('pass') else 'Some logins unacknowledged'
    if not measured(stage):
        return 'Gameplay not measured'
    if not verified(stage):
        return 'Unqualified: presence not maintained or unavailable'
    return 'Qualified for this sampled workload' if qualified(stage, report) else 'Did not meet every gate'


def comparable(stage, report, old, baseline):
    if not old or not complete(stage, report) or not complete(old, baseline):
        return False
    fields = ('kind', 'requestedPlayers', 'rooms', 'authoredObjectsPerRoom', 'durationMs')
    return all(stage.get(key) == old.get(key) for key in fields) and \
        report.get('syntheticAccounts') == baseline.get('syntheticAccounts') and \
        report.get('methodology', {}).get('inputIntervalMs') == baseline.get('methodology', {}).get('inputIntervalMs')


def simulation_result(stage, report):
    if not stage:
        return 'Not measured'
    count = stage.get('completedTicks', 0)
    requested = stage.get('requestedTicks', report.get('options', {}).get('ticks', 20))
    timing = stage.get('tickWallMs', {})
    if count >= 20:
        result = 'Sample p95 ' + num(timing.get('p95')) + ' ms'
    elif count:
        result = 'Max observed ' + num(timing.get('max')) + ' ms; insufficient percentile samples'
    else:
        result = 'No measured updates completed'
    return result + '; ' + str(count) + '/' + str(requested) + ' updates; ' + str(stage.get('status', 'unknown'))


def plot_http(stages, report, baseline):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    plt.rcParams.update({'font.size': 9, 'svg.fonttype': 'none'})
    shown = [stage for stage in stages if measured(stage) and not cutoff(stage, report)]
    if not shown:
        return ''
    old = {stage['name']: stage for stage in (baseline or {}).get('scenarios', [])}
    figure, axes = plt.subplots(2, 1, figsize=(13, 8), sharex=True, constrained_layout=True)
    x = np.arange(len(shown))
    axes[0].bar(x, [stage['inputLatencyMs']['p95'] for stage in shown],
                color=['#197455' if qualified(stage, report) else '#b3632d' for stage in shown],
                label='Changed implementation')
    baseline_label = False
    for index, stage in enumerate(shown):
        previous = old.get(stage['name'])
        if comparable(stage, report, previous, baseline or {}):
            label = 'Baseline: matched complete workload' if not baseline_label else None
            axes[0].plot(index, previous['inputLatencyMs']['p95'], 'D', color='#33465e', markersize=5, label=label, zorder=4)
            axes[1].plot(index, previous['deliveredSlotRatio'] * 100, 'D', color='#33465e', markersize=5, label=label, zorder=4)
            baseline_label = True
    axes[0].axhline(100, linestyle='--', color='#657389', label='p95 gate: 100 ms')
    axes[0].set_yscale('log')
    axes[0].set_ylabel('Request p95 · milliseconds · log scale')
    axes[0].legend(loc='upper left', fontsize=8)
    axes[1].bar(x, [stage.get('deliveredSlotRatio', 0) * 100 for stage in shown], color='#377ba0', zorder=2)
    axes[1].axhline(95, linestyle='--', color='#657389', label='Delivery gate: 95%')
    axes[1].set_ylabel('Successful updates / offered slots (%)')
    axes[1].set_ylim(0, 105)
    axes[1].set_xticks(x, [name(stage) + (' †' if not verified(stage) else '') for stage in shown], rotation=60, ha='right')
    axes[1].legend(loc='lower left', fontsize=8)
    for axis in axes:
        axis.grid(axis='y', alpha=.15)
        axis.spines[['top', 'right']].set_visible(False)
    stream = io.StringIO()
    figure.savefig(stream, format='svg')
    plt.close(figure)
    svg = stream.getvalue()
    svg = svg[svg.index('<svg'):]
    return svg.replace('<svg ', '<svg role="img" aria-label="Measured HTTP response latency and input delivery compared with baseline" ', 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    directory = args.directory.resolve()
    output = args.output or directory / 'report.html'
    current = {key: load(directory / (key + '.json')) for key in ('http', 'simulation', 'storage', 'admission', 'workflow')}
    missing = [key for key, value in current.items() if value is None]
    if missing:
        parser.error('Missing completed experiment inputs: ' + ', '.join(missing))
    unfinished = [key for key, value in current.items() if not value.get('finishedAt')]
    if unfinished:
        parser.error('Experiments are still running; final report requires finishedAt: ' + ', '.join(unfinished))
    http, simulation, storage, admission, workflow = [current[key] for key in current]
    baseline = {key: load(args.baseline / (key + '.json')) for key in ('http', 'simulation', 'storage', 'admission')} if args.baseline else {}
    before = baseline.get('http') or {}
    stages = http.get('scenarios', [])
    gameplay = [stage for stage in stages if stage.get('kind') != 'login']
    passes = [stage for stage in gameplay if qualified(stage, http)]
    old_gameplay = [stage for stage in before.get('scenarios', []) if stage.get('kind') != 'login']
    old_passes = [stage for stage in old_gameplay if qualified(stage, before)]
    sims = {stage['scenario']['players']: stage for stage in simulation.get('scenarios', [])}
    env = http.get('environment', {})
    quota = (env.get('cgroupCpuMax') or '').split()
    cpu = num(int(quota[0]) / int(quota[1]), 0) + ' CPU equivalents' if len(quota) == 2 and quota[0] != 'max' else 'unavailable'
    memory = num(int(env['cgroupMemoryMax']) / 1073741824, 0) + ' GiB' if str(env.get('cgroupMemoryMax', '')).isdigit() else 'unavailable'
    interruptions = []
    for report in (http, workflow):
        for item in report.get('externalInterruptions', []):
            if item not in interruptions:
                interruptions.append(item)

    content = '<header><p class="eyebrow">MUZIKAZ · IMPLEMENTATION AND CAPACITY EVIDENCE</p>'
    content += '<h1>Server quality and workload qualification</h1><p class="lead"><strong>'
    content += str(len(passes)) + ' of ' + str(len(gameplay)) + ' attempted HTTP gameplay workloads met every chosen gate.</strong> '
    content += 'A passing short workload qualifies that sample; it does not certify a sustained public launch or establish an overall player limit.</p>'
    if before:
        content += '<p>Baseline: ' + str(len(old_passes)) + '/' + str(len(old_gameplay)) + ' gameplay workloads met all gates. '
        content += 'The new results measure changed server code, with the same assessment targets.</p>'
    content += '<p>Experiment window: ' + esc(stamp(workflow.get('startedAt'))) + ' to ' + esc(stamp(workflow.get('finishedAt'))) + '.</p></header>'
    content += '<div class="notice"><strong>Three different measurements:</strong> connected clients making real HTTP gameplay requests; '
    content += 'synthetic populations running simulation only; and cold-login attempts. Their player and request counts are not interchangeable.</div>'
    if interruptions:
        content += '<div class="notice"><strong>External execution interruption recorded.</strong> Completed results were retained and remaining '
        content += 'work was resumed as documented in the workflow. This is separate from deliberate per-stage experiment cutoffs. '
        content += 'An interrupted experiment alone does not establish a spontaneous game-server crash.</div>'

    content += '<section><h2>What is qualified and what remains open</h2><p>Qualified HTTP samples: '
    content += esc(', '.join(name(stage) for stage in passes) or 'none') + '.</p>'
    unqualified = [stage for stage in gameplay if not qualified(stage, http)]
    content += '<p>Workloads not meeting every gate: ' + esc(', '.join(name(stage) for stage in unqualified) or 'none') + '.</p>'
    target_rows = []
    world = next((stage for stage in stages if stage.get('name') == 'commons-128'), None)
    if world:
        observation = str(world.get('joinedPlayers', 'unavailable')) + ' joins acknowledged; presence before/after: ' + \
            presence(world.get('occupancyBefore', {})) + ' / ' + presence(world.get('occupancyAfter', {}))
        if measured(world) and not cutoff(world, http):
            observation += '; p95 ' + num(world['inputLatencyMs'].get('p95')) + ' ms; delivery ' + pct(world.get('deliveredSlotRatio'))
        target_rows.append(['128 in one public world', 'Real authenticated HTTP', assessment(world, http), observation])
    for target in (1000, 10000):
        target_rows.append([f'{target:,} across rooms', 'Simulation-only synthetic population',
                            'Live-client fleet capacity not qualified by this exercise', simulation_result(sims.get(target), simulation)])
    content += table(['Target', 'What was exercised', 'Qualification status', 'Measured evidence'], target_rows)
    content += '<p>Admission limits and cumulative join acknowledgments do not establish concurrent gameplay capacity. '
    content += 'A health response also does not establish that game updates meet their deadlines.</p></section>'

    content += '<section><h2>Test conditions and changed implementation</h2><p>The measured implementation includes changes to authentication, '
    content += 'identity refresh, persistence and world-resource caches. The base commit is <code>' + esc(http.get('sourceCommit', workflow.get('sourceCommit', 'unavailable'))) + '</code>. '
    content += 'A base commit label alone may precede the implementation commit; the workflow’s changed-file manifests and hashes identify '
    content += 'the exact tested working tree. This is a comparison with the earlier implementation, not a claim of unchanged source.</p>'
    if workflow.get('runtimeSourceSHA256'):
        content += '<p>Tested runtime fingerprint: <code>' + esc(workflow['runtimeSourceSHA256']) + '</code>.</p>'
    content += '<p>Environment: ' + esc(cpu) + '; memory limit ' + esc(memory) + '; Node ' + esc(env.get('node', 'unavailable')) + '. '
    content += 'HTTP fixtures contain ' + esc(http.get('syntheticAccounts', 'unavailable')) + ' stored synthetic accounts. '
    content += 'Stages use fresh server processes and reset fixtures, warm authentication caches and '
    content += num(http.get('durationMs', 0) / 1000, 0) + ' seconds of offered movement; the wall budget includes setup. '
    content += 'The workflow records the sequential benchmark commands, their statuses and timing.</p>'
    if http.get('batches'):
        content += '<p>Execution batches are retained below. Independently seeded batches may have different synthetic identities even when '
        content += 'account counts and fixture structure match.</p>'
        content += table(['Batch', 'Completed scenario records', 'Execution status'], [
            [entry.get('file'), entry.get('completedScenarios', 'unavailable'), entry.get('status', 'unavailable')]
            for entry in http['batches']])
    content += '<p>The assessment uses p95 ≤100 ms, p99 ≤250 ms, at least 95% successful delivery of offered 20 Hz input slots by the deadline, '
    content += 'at least 99% successful completed input requests, valid snapshots and maintained expected occupancy. Capacity guards, health checks '
    content += 'and mixed-ledger checks must also pass where exercised. These are chosen engineering gates, not a universal industry standard.</p>'
    content += '<p>One input may be in flight per player. Skipped slots remain in the denominator, and request timings include errors and timeouts. '
    content += 'Loopback clients and the server share a machine. Browser/GPU/VR rendering, WAN behavior, vehicle driving, live payment settlement, '
    content += 'power-loss durability and multi-host failover require separate qualification.</p></section>'

    content += '<section><h2>HTTP latency and update delivery</h2>' + plot_http(stages, http, before)
    content += '<p class="caption">Bars show the changed implementation; dark diamonds show matched complete baseline stages with verified presence. '
    content += 'Green latency bars identify full gate passes. † Presence was not maintained or could not be verified. '
    content += 'Experiment-cutoff stages are omitted from the chart and retained in the table.</p>'
    rows = []
    for stage in stages:
        login = stage.get('kind') == 'login'
        timing = stage.get('latencyMs', {}) if login else stage.get('inputLatencyMs', {})
        available = login or measured(stage)
        suffix = ' †' if cutoff(stage, http) and available else ''
        rows.append([name(stage), stage.get('requestedPlayers', stage.get('requested', '—')),
                     stage.get('joinedPlayers', stage.get('successful', '—')),
                     'login test only' if login else presence(stage.get('occupancyBefore', {})) + ' / ' + presence(stage.get('occupancyAfter', {})),
                     num(timing.get('p95')) + suffix if available else 'not measured',
                     num(timing.get('p99')) + suffix if available else 'not measured',
                     pct(stage.get('deliveredSlotRatio')) + suffix if measured(stage) else 'not measured', assessment(stage, http)])
    content += table(['Workload', 'Requested players', 'Join/login acknowledgments', 'Presence before / after', 'Request p95 ms',
                      'Request p99 ms', 'Delivered slots', 'Assessment'], rows)
    content += '<p class="caption">† Timings from experiment-limited stages can include requests after termination; they do not qualify '
    content += 'steady gameplay. Failed occupancy replies mean unavailable, not zero players. Cutoffs are imposed experiment terminations.</p></section>'

    if before:
        content += '<section><h2>Measured change from the baseline</h2><p>Only matching scene sizes, populations, durations, stored-account counts '
        content += 'and input cadence are paired. Both stages must be complete, free of experiment cutoffs and verified for expected presence. '
        content += 'Synthetic identities and random activity may differ. Short runs describe observed results; they do not establish statistical '
        content += 'significance or sustained production capacity.</p>'
        prior = {stage['name']: stage for stage in before.get('scenarios', [])}
        paired = []
        for stage in stages:
            old = prior.get(stage['name'])
            if comparable(stage, http, old, before):
                paired.append([name(stage), num(old['inputLatencyMs'].get('p95')), num(stage['inputLatencyMs'].get('p95')),
                               pct(old.get('deliveredSlotRatio')), pct(stage.get('deliveredSlotRatio')),
                               'passed' if qualified(old, before) else 'outside gates',
                               'passed' if qualified(stage, http) else 'outside gates'])
        content += table(['Workload', 'Baseline p95 ms', 'Changed p95 ms', 'Baseline delivery', 'Changed delivery', 'Baseline gates', 'Changed gates'], paired) + '</section>'

    content += '<section><h2>Simulation budget with synthetic players</h2><p>These fixtures use real production collision, NPC logic, queues '
    content += 'and room state. They contain unique synthetic active players in light park scenes. The timed work excludes HTTP clients, '
    content += 'authentication, serialized network snapshots, economic settlement and disk writes. Twenty updates represent one simulated second, '
    content += 'advanced in 50 ms steps without real-time pacing. A completed sample can still exceed its 50 ms budget.</p>'
    sim_rows = []
    old_simulation = {stage['scenario']['players']: stage for stage in (baseline.get('simulation') or {}).get('scenarios', [])}
    for stage in simulation.get('scenarios', []):
        count = stage.get('completedTicks', 0)
        timing = stage.get('tickWallMs', {})
        rss = stage.get('memory', {}).get('peakSampledRssBytes', stage.get('peakSampledRssBytes'))
        previous = old_simulation.get(stage['scenario']['players'], {})
        old_count = previous.get('completedTicks', 0)
        old_timing = previous.get('tickWallMs', {})
        prior_observation = 'p95 ' + num(old_timing.get('p95')) if old_count >= 20 else \
            'max ' + num(old_timing.get('max')) + '; ' + str(old_count) + ' samples' if old_count else 'not measured'
        sim_rows.append([stage['scenario']['players'], stage['scenario']['roomCount'],
                         str(count) + '/' + str(stage.get('requestedTicks', simulation.get('options', {}).get('ticks', 20))),
                         prior_observation, num(timing.get('p95')) if count >= 20 else 'insufficient samples', num(timing.get('max')),
                         str(stage.get('deadline50ms', {}).get('hits', 0)) + '/' + str(count) if count else 'not measured',
                         num(rss / 1048576) if rss is not None else 'unavailable', stage.get('status', 'unknown')])
    content += table(['Synthetic players', 'Rooms', 'Measured updates', 'Baseline update ms', 'Changed sample p95 ms', 'Changed max ms', 'Within 50 ms', 'Peak sampled RSS MiB', 'Status'], sim_rows)
    content += '<p>With only one or two updates, report the observations rather than a meaningful p95/p99 estimate. '
    content += 'A hard timeout is an experiment limit, not an out-of-memory finding unless the evidence separately establishes that cause.</p></section>'

    content += '<section><h2>Storage correctness and dataset growth</h2><p>Saved record counts are dataset sizes, not concurrent players. '
    content += 'The workloads retain ' + esc(storage.get('options', {}).get('operations', 'unavailable')) + ' operations with up to '
    content += esc(storage.get('options', {}).get('concurrency', 'unavailable')) + ' outstanding. Passed integrity checks validate the listed '
    content += 'invariants; they do not assign a latency grade.</p>'
    content += table(['Integrity invariant', 'Result'], [[item['name'].replace('_', ' '), item['status']] for item in storage.get('correctness', [])])
    old_storage = {(item['scale']['users'], work['name']): work for item in (baseline.get('storage') or {}).get('growth', []) for work in item.get('workloads', [])}
    storage_rows = []
    for growth in storage.get('growth', []):
        for work in growth.get('workloads', []):
            previous = old_storage.get((growth['scale']['users'], work['name']), {})
            storage_rows.append([str(growth['scale']['users']) + ' / ' + str(growth['scale']['storedRooms']), work['name'].replace('_', ' '),
                                 str(work.get('completed')) + '/' + str(work.get('requested')), num(previous.get('operationsPerSecond'), 3),
                                 num(work.get('operationsPerSecond'), 3), num(previous.get('latencyMs', {}).get('p95')),
                                 num(work.get('latencyMs', {}).get('p95')), work.get('status')])
    content += table(['Stored users / rooms', 'Workload', 'Completed', 'Baseline ops/s', 'Changed ops/s', 'Baseline p95 ms', 'Changed p95 ms', 'Completion'], storage_rows)
    content += '<p>User transactions now use group commits. End-to-end operation latency and throughput remain the relevant before/after '
    content += 'measurements; the preceding commit barrier cannot identify an individual operation’s queue and service time. Those user-store '
    content += 'queue/service measurements are unavailable and are not presented as zeros. The room-counter workload measures cloning and queues, '
    content += 'not gameplay physics.</p><p>Local file caches, queues and room journals do not provide a distributed transactional database or '
    content += 'multi-host writer coordination. Backup/export must force the canonical checkpoint; a copied live journal is outside that backup contract.</p></section>'

    content += '<section><h2>Cold-login pressure</h2><p>These are offered login attempts over the configured window, with a client-side cap '
    content += 'on in-flight requests. Unissued attempts represent client backpressure, not server rejections. Acknowledged HTTP 201 logins '
    content += 'are authenticated admissions, not concurrent gameplay players. Requests can commit server records after the client times out.</p>'
    old_admission = {stage['offeredAttempts']: stage for stage in (baseline.get('admission') or {}).get('stages', [])}
    admission_rows = []
    for stage in admission.get('stages', []):
        previous = old_admission.get(stage['offeredAttempts'], {})
        if any(stage.get(key) != previous.get(key) for key in ('durationMs', 'maxInFlight')):
            previous = {}
        admission_rows.append([stage['offeredAttempts'], num(stage.get('durationMs', 0) / 1000, 0), stage.get('attemptsIssued'), stage.get('droppedSlots'),
                               stage.get('authenticatedByDeadline'), stage.get('authenticatedAdmissions'), previous.get('authenticatedByDeadline', '—'),
                               num(stage.get('authenticatedAdmissionsPerSecond')), num(stage.get('requestLatencyMs', {}).get('p95')),
                               'all gates met' if stage.get('pass') else 'not all gates met'])
    content += table(['Offered', 'Window s', 'Issued', 'Unissued: client cap', 'Authenticated by deadline', 'Authenticated incl. drain',
                      'Baseline by deadline', 'Admissions/s by deadline', 'Request p95 ms', 'Assessment'], admission_rows)
    content += '<p>Timeout settings are scheduling limits; observed completion times can exceed them under load. '
    content += 'Persisted records and acknowledged admissions are retained separately in the raw data.</p></section>'

    content += '<section><h2>Checkpointed restart and wallet reconciliation</h2>'
    recovery = http.get('recovery') or {}
    content += '<p>The recovery experiment waits for a persisted checkpoint, kills the local server, restarts it and verifies selected state. '
    content += 'It does not qualify arbitrary in-flight financial crashes, power-loss durability or persistence of in-memory sports matches.</p>'
    recovery_rows = [['Overall restart check', 'passed' if recovery.get('pass') else 'failed' if recovery.get('pass') is False else 'not completed']]
    for key, label in [('sessionSurvived', 'Session survived'), ('balancePreserved', 'Balance preserved'), ('inventoryPreserved', 'Inventory preserved'),
                       ('publishedMapPreserved', 'Published map preserved'), ('checkpointPreserved', 'Checkpointed position preserved')]:
        recovery_rows.append([label, recovery.get(key, 'unavailable')])
    recovery_rows.append(['Observed restart time ms', num(recovery.get('restartMs'))])
    content += table(['Restart check', 'Result'], recovery_rows)
    ledger_rows = []
    for stage in stages:
        side = stage.get('sideTraffic', {})
        if side.get('requests', 0):
            ledger = side.get('ledgerAssessment') or {}
            ledger_rows.append([name(stage), ledger.get('status', 'not completed'), side.get('acknowledgedSpends', '—'),
                                ledger.get('creditsMzk', '—'), ledger.get('debitsMzk', '—'), side.get('balanceBefore', '—'), side.get('balanceAfter', '—')])
    if ledger_rows:
        content += table(['Mixed workload', 'Ledger assessment', 'Acknowledged spends', 'Credits MZK', 'Debits MZK', 'Starting balance', 'Ending balance'], ledger_rows)
    content += '<p>Ledger reconciliation includes every captured signed change, including gameplay credits, and verifies each acknowledged '
    content += 'spend receipt exactly once. Timeouts produce an inconclusive assessment instead of an automatic corruption finding. '
    content += 'The qualification count covers the listed pressure workloads; other regression checks are tracked in the work order.</p></section>'

    content += '<section><h2>Reproduce and inspect the evidence</h2><p>The commands below use isolated synthetic state. Retain the source '
    content += 'manifest, fixture sizes, cadence, time windows and resource limits when comparing results. Workflow exit code 1 can indicate '
    content += 'a failed qualification gate; inspect the family results rather than treating every nonzero exit as a server crash.</p>'
    commands = []
    for entry in workflow.get('commands', []):
        argv = entry.get('argv', entry.get('command', []))
        commands.append(shlex.join(argv) if isinstance(argv, list) else str(argv))
    content += '<pre>' + esc('\n'.join(commands)) + '</pre>'
    payload = {'changed-' + key: value for key, value in current.items()}
    for key, value in baseline.items():
        if value is not None:
            payload['baseline-' + key] = value
    for entry in http.get('batches', []):
        path = directory / str(entry.get('file', ''))
        if path.parent == directory and path.suffix == '.json' and path.is_file():
            payload['raw-http-batch-' + path.name] = load(path)
    for key in ('independent-audit', 'validation', 'source-manifest'):
        value = load(directory / (key + '.json'))
        if value is not None:
            payload[key] = value
    for key, value in payload.items():
        content += evidence('Embedded evidence · ' + key, value)
    content += '</section>'
    css = '''body{font:16px/1.65 system-ui,-apple-system,sans-serif;color:#243447;background:#edf2f6;margin:0}main{max-width:1280px;margin:32px auto;padding:36px 40px;background:white;border-radius:16px;box-shadow:0 10px 40px #26384910}header{padding-bottom:20px;border-bottom:1px solid #dbe4ec}.eyebrow{font-size:12px;letter-spacing:.09em;font-weight:750;color:#39678a}h1{font-size:clamp(30px,4vw,44px);line-height:1.15;color:#142d43;max-width:1000px}h2{font-size:24px;line-height:1.3;color:#1c405c;margin:0 0 14px}.lead{font-size:20px;max-width:1100px}p{max-width:1140px}section{margin-top:38px}.notice{padding:16px 20px;margin-top:24px;background:#edf5fb;border-left:4px solid #37789f}.scroll{overflow:auto;border:1px solid #dbe4ec;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.5}th,td{padding:11px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #dbe4ec}th{background:#edf2f7;font-weight:700;white-space:nowrap}tbody tr:nth-child(even){background:#f8fafc}tbody tr:last-child td{border-bottom:0}td:first-child{font-weight:650}.caption{font-size:13px;color:#586c7d}svg{max-width:100%;height:auto}pre{padding:16px;background:#f0f4f8;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:6px}code{padding:2px 5px;background:#edf2f6;font-size:13px;overflow-wrap:anywhere;border-radius:4px}details{margin:12px 0;border:1px solid #dbe4ec;border-radius:6px}summary{cursor:pointer;padding:12px 16px;font-weight:650}details pre{margin:0;border-radius:0}a{color:#145f8f;text-underline-offset:3px}@media(max-width:700px){main{margin:0;padding:24px 16px;border-radius:0}.lead{font-size:18px}h2{font-size:22px}th,td{padding:9px}section{margin-top:30px}}@media print{body{background:#fff}main{margin:0;padding:0;box-shadow:none}.scroll{overflow:visible}table{font-size:9px}details{display:none}a{color:inherit}}'''
    document = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    document += '<title>MUZIKAZ server quality and workload qualification</title><style>' + css + '</style></head><body><main>' + content + '</main></body></html>'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(document)
    print(output)


if __name__ == '__main__':
    main()
