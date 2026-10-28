#!/usr/bin/env python3
"""Render a portable MUZIKAZ repeat-test and sourced platform comparison report."""
import argparse
import html
import io
import json
import shlex
from datetime import datetime
from pathlib import Path


def esc(value):
    return html.escape(str(value))


def num(value, places=1):
    return '—' if value is None else f'{value:,.{places}f}'


def pct(value):
    return '—' if value is None else num(value * 100) + '%'


def readable_time(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M UTC')
    except (AttributeError, ValueError):
        return str(value)


def load(path):
    return json.loads(path.read_text()) if path.exists() else None


def table(headers, rows):
    return '<div class="scroll"><table><thead><tr>' + ''.join(
        '<th scope="col">' + esc(item) + '</th>' for item in headers
    ) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(
        '<td>' + esc(item) + '</td>' for item in row
    ) + '</tr>' for row in rows) + '</tbody></table></div>'


def raw(label, value):
    return '<details><summary>' + esc(label) + '</summary><pre>' + esc(
        json.dumps(value, indent=2, ensure_ascii=False)) + '</pre></details>'


def cutoff_names(report):
    return {entry.get('scenario') for entry in report.get('interventions', [])}


def cutoff(stage, report):
    return bool(stage.get('stageTimedOut') or stage.get('name') in cutoff_names(report))


def measured(stage):
    return stage.get('inputLatencyMs', {}).get('count', 0) > 0


def presence(occupancy):
    rooms = occupancy.get('rooms', [])
    responding = [room for room in rooms if room.get('status') == 200]
    if not rooms:
        return 'not checked'
    if not responding:
        return 'unavailable'
    count = str(sum(room.get('activeHumans', 0) for room in responding))
    return count if len(responding) == len(rooms) else count + ' observed; partial replies'


def verified(stage):
    return stage.get('occupancyBefore', {}).get('allExpectedPresent') is True and \
        stage.get('occupancyAfter', {}).get('allExpectedPresent') is True and \
        stage.get('joinedPlayers') == stage.get('requestedPlayers')


def complete_gameplay(stage, report):
    return stage.get('kind') != 'login' and measured(stage) and verified(stage) and \
        not stage.get('error') and not cutoff(stage, report)


def assessment(stage, report):
    if cutoff(stage, report):
        return 'Experiment cutoff; capacity unqualified'
    if stage.get('error'):
        return 'Stage failed: ' + stage['error']
    if stage.get('kind') == 'login':
        return 'All logins completed' if stage.get('pass') else 'Some logins failed'
    if not measured(stage):
        return 'Gameplay not measured'
    if not verified(stage):
        return 'Occupancy not maintained or unavailable; outside targets'
    return 'Met chosen targets' if stage.get('pass') else 'Outside chosen targets'


def simulation_summary(stage):
    if not stage:
        return 'Not measured'
    count = stage.get('completedTicks', 0)
    timing = stage.get('tickWallMs', {})
    if count >= 20:
        observation = 'Observed p95 ' + num(timing.get('p95')) + ' ms'
    elif count:
        observation = 'Max observed ' + num(timing.get('max')) + ' ms (' + str(count) + ' samples)'
    else:
        observation = 'No measured ticks completed'
    return observation + '; ' + str(count) + '/' + str(stage.get('requestedTicks', 20)) + ' ticks; ' + stage.get('status', 'unknown')


def svg_chart(stages, report, previous_stages):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    plt.rcParams.update({'font.size': 9, 'svg.fonttype': 'none'})
    observed = [stage for stage in stages if measured(stage) and not cutoff(stage, report)]
    if not observed:
        return ''
    fig, axes = plt.subplots(2, 1, figsize=(12, 7.5), sharex=True, constrained_layout=True)
    labels = [stage['name'] + ('†' if not verified(stage) else '') for stage in observed]
    x = np.arange(len(observed))
    axes[0].bar(x, [stage['inputLatencyMs']['p95'] for stage in observed],
                color=['#17674c' if stage.get('pass') else '#b65d26' for stage in observed], label='Repeat run')
    for index, stage in enumerate(observed):
        prior, prior_report = previous_stages.get(stage['name'], (None, None))
        if prior and complete_gameplay(stage, report) and complete_gameplay(prior, prior_report):
            axes[0].plot(index, prior['inputLatencyMs']['p95'], 'D', color='#34445b', markersize=5,
                         label='Previous complete, verified stage' if not any(
                             line.get_label() == 'Previous complete, verified stage' for line in axes[0].lines) else None)
    axes[0].axhline(100, color='#4f5e6f', linestyle='--', label='Chosen p95 target: 100 ms')
    axes[0].set_ylabel('Request p95 (ms; log scale)')
    axes[0].set_yscale('log')
    axes[0].legend(loc='upper left', fontsize=8)
    axes[1].bar(x, [stage.get('deliveredSlotRatio', 0) * 100 for stage in observed], color='#326d9c')
    axes[1].axhline(95, color='#4f5e6f', linestyle='--', label='Chosen delivery target: 95%')
    axes[1].set_ylabel('Successful / offered slots (%)')
    axes[1].set_ylim(0, 105)
    axes[1].set_xticks(x, labels, rotation=60, ha='right')
    axes[1].legend(loc='lower left', fontsize=8)
    for axis in axes:
        axis.spines[['top', 'right']].set_visible(False)
        axis.grid(axis='y', alpha=.15)
    stream = io.StringIO()
    fig.savefig(stream, format='svg')
    plt.close(fig)
    return '<svg role="img" aria-label="Repeat MUZIKAZ input latency and delivery measurements" ' + stream.getvalue().split('<svg', 1)[1].split(' ', 1)[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    directory = args.directory.resolve()
    output = args.output or directory / 'report.html'
    payload = {name: load(directory / (name + '.json')) for name in
               ('http', 'simulation', 'storage', 'admission', 'workflow', 'comparison-sources')}
    missing = [name for name, value in payload.items() if value is None]
    if missing:
        parser.error('Missing completed report inputs: ' + ', '.join(missing))
    http, simulation, storage, admission, workflow, comparison = [payload[key] for key in payload]
    if not http.get('finishedAt') or not workflow.get('finishedAt'):
        parser.error('Benchmark workflow has not finished; refusing to label a partial run final')
    previous_reports = []
    previous_stages = {}
    for name in ('http-first-pass', 'http-remaining', 'http-hockey-recheck'):
        path = directory.parent / (name + '.json')
        report = load(path)
        if report:
            previous_reports.append({'file': path.name, 'report': report})
            for stage in report.get('scenarios', []):
                previous_stages[stage['name']] = (stage, report)
    payload['previous-http-batches'] = previous_reports
    repeat_batches = {}
    batch_files = {batch.get('file') for batch in http.get('batches', []) if batch.get('file')}
    batch_files.update(('http-first-batch.json', 'http-remaining.json', 'workflow-first-attempt.json'))
    for filename in sorted(batch_files):
        # Only inspect sibling JSON artifacts; never interpret arbitrary remote or absolute paths.
        if Path(filename).name != filename or not filename.endswith('.json'):
            continue
        batch = load(directory / filename)
        if batch is not None:
            repeat_batches[filename] = batch
    if repeat_batches:
        payload['repeat-raw-batches-and-original-workflow'] = repeat_batches
    interruptions = []
    for event in http.get('externalInterruptions', []) + workflow.get('externalInterruptions', []):
        if event not in interruptions:
            interruptions.append(event)
    stages = http.get('scenarios', [])
    gameplay = [stage for stage in stages if stage.get('kind') != 'login']
    passed = [stage for stage in gameplay if complete_gameplay(stage, http) and stage.get('pass')]
    cutoffs = [stage for stage in gameplay if cutoff(stage, http)]
    sims = {stage['scenario']['players']: stage for stage in simulation.get('scenarios', [])}
    env = http.get('environment', {})
    quota = (env.get('cgroupCpuMax') or '').split()
    cpu_equivalents = num(int(quota[0]) / int(quota[1]), 0) if len(quota) == 2 and quota[0] != 'max' else 'unlimited'
    for name in ('independent-audit', 'cleanup'):
        evidence = load(directory / (name + '.json'))
        if evidence is not None:
            payload[name] = evidence
    content = '<header><p class="eyebrow">MUZIKAZ · REPEAT MEASUREMENTS + DOCUMENTED PLATFORM CAPABILITIES</p>'
    content += '<h1>Server retest and platform comparison</h1><p class="lead">'
    content += esc(str(len(passed)) + ' of ' + str(len(gameplay)) + ' attempted HTTP gameplay scenarios met the chosen targets.')
    content += ' Capacity depends on the world and workload; the configured room limits do not establish smooth gameplay.</p>'
    content += '<p>Test window: ' + esc(readable_time(workflow.get('startedAt'))) + ' to ' + esc(readable_time(workflow.get('finishedAt')))
    content += '. Exact timestamps are retained in the embedded evidence.</p></header>'
    content += '<div class="notice"><strong>Measured here:</strong> an isolated, unmodified MUZIKAZ server and synthetic data. '
    content += '<strong>Documented comparison:</strong> Roblox, Colyseus, Nakama and Photon. '
    content += 'No external platform was load-tested, so these results support no vendor speed ratio or equivalent player-capacity ranking.</div>'
    if interruptions:
        content += '<div class="notice"><strong>Execution interruption and resumption:</strong> '
        content += str(len(interruptions)) + ' external managed-environment interruption(s) occurred during this repeat. '
        content += 'Completed checkpoint results were retained and the remaining scenarios were run in a fresh batch. '
        content += 'This is separate from the deliberate per-stage experiment cutoffs. The external cause was not established; '
        content += 'no cgroup out-of-memory event was recorded. An interrupted attempt does not establish a spontaneous game-server crash.</div>'
    content += '<section><h2>What the repeat establishes</h2>'
    content += '<p>Source commit <code>' + esc(http.get('sourceCommit')) + '</code>. '
    content += 'The production source is unchanged from the first run. The test tools now use the corrected hockey occupancy query and reconcile '
    content += 'all signed mixed-gameplay ledger changes, including automatic credits. Differences between runs are observations, '
    content += 'not evidence of a server optimization.</p>'
    content += '<p>The HTTP tests use ' + esc(http.get('syntheticAccounts')) + ' stored synthetic accounts, a fresh server and reset state per scenario within each batch, '
    content += num(http.get('durationMs', 0) / 1000, 0) + ' seconds of offered movement per stage, warm authentication caches, '
    content += 'and a ' + esc(http.get('methodology', {}).get('stageWallBudgetSeconds')) + '-second experiment budget including setup. '
    content += 'All benchmark families run sequentially on the same machine. '
    content += 'CPU quota: ' + esc(cpu_equivalents) + ' core equivalents; memory limit: '
    content += num(int(env['cgroupMemoryMax']) / 1073741824, 0) + ' GiB. Node ' + esc(env.get('node')) + '.</p>'
    if interruptions or len(http.get('batches', [])) > 1:
        content += '<p>Resumed batches use independently seeded synthetic account identities with equivalent account counts and fixture structure. '
        content += 'The seeded files are reset identically between scenarios inside a batch; the files and identities are not byte-identical across batches. '
        content += 'The final table selects the retained completed scenario or its completed rerun, rather than counting an interrupted attempt twice.</p>'
        if http.get('batches'):
            content += table(['HTTP batch', 'Completed scenario records', 'Execution status'], [
                [batch.get('file'), batch.get('completedScenarios'), batch.get('status')] for batch in http['batches']])
        content += raw('External interruption records and resumption provenance', interruptions)
    content += '<p>Passing stages: ' + esc(', '.join(stage['name'] for stage in passed) or 'none') + '. '
    content += str(len(cutoffs)) + ' gameplay stages reached an imposed experiment cutoff. '
    content += 'A cutoff means the experiment terminated the isolated server; it is not classified as a spontaneous server crash.</p>'
    world = next((stage for stage in stages if stage['name'] == 'commons-128'), None)
    requested = []
    if world:
        evidence = str(world.get('joinedPlayers', 'unavailable')) + ' joins acknowledged; active before/after: ' + \
            presence(world.get('occupancyBefore', {})) + ' / ' + presence(world.get('occupancyAfter', {}))
        if cutoff(world, http):
            evidence += '; experiment cutoff'
        elif measured(world):
            evidence += '; request p95 ' + num(world['inputLatencyMs'].get('p95')) + ' ms; slots ' + pct(world.get('deliveredSlotRatio'))
        else:
            evidence += '; gameplay not measured'
        requested.append(['128 in one public world', 'Actual authenticated HTTP path', assessment(world, http), evidence])
    for target in (1000, 10000):
        stage = sims.get(target)
        requested.append([f'{target:,} across worlds', 'Synthetic simulation only; no live clients',
                          'End-to-end player capacity remains unvalidated', simulation_summary(stage)])
    content += table(['Requested target', 'Exercise', 'Assessment', 'Evidence'], requested) + '</section>'

    content += '<section><h2>Where MUZIKAZ fits</h2><p>MUZIKAZ is a custom browser game and creator platform built on a third-party '
    content += 'renderer, Three.js, with custom gameplay, editor integration and a custom Node.js authoritative server. '
    content += 'It is not a completely from-scratch rendering engine. Its custom-cabinet templates assign existing game rules '
    content += 'rather than arbitrary creator code (local evidence: <code>docs/arcade-machines.md:24</code>). '
    content += 'Roblox includes a hosted engine and authoring ecosystem; '
    content += 'Colyseus is the closest Node.js room-server comparison; Nakama is a useful backend comparison.</p>'
    rows = []
    for item in comparison.get('recommendedComparisonRows', []):
        source_ids = ', '.join(item.get('sourceIds', []))
        capacity_statement = item.get('capacityStatement', '')
        if item['platform'].startswith('MUZIKAZ'):
            capacity_statement = (str(len(passed)) + '/' + str(len(gameplay)) +
                                  ' attempted gameplay scenarios met the chosen targets in this repeat. '
                                  'Configured 15/128 admission limits are not sustained-capacity results.')
        rows.append([item['platform'], item.get('category', ''), item.get('currentArchitecture', ''),
                     capacity_statement, item.get('whatMUZIKAZCanLearn', item.get('ownershipAndTooling', '')), source_ids or 'Local source + measurements'])
    content += table(['Platform', 'What it provides', 'Runtime, state and deployment', 'Capacity interpretation', 'Relevance to MUZIKAZ', 'Source IDs'], rows)
    content += '<p>MUZIKAZ currently sends gameplay inputs through HTTP POSTs and returns JSON snapshots, while background simulation '
    content += 'targets 50 ms updates. The support WebSocket does not carry gameplay. Rooms share one Node.js process and a serialized '
    content += 'file-backed store. Roblox supplies managed server instances and replication; Colyseus supplies room ownership and state patches; '
    content += 'Nakama supplies authoritative match handlers and database-backed player services. These are architectural capabilities, '
    content += 'not results of equivalent performance tests.</p>'
    content += '<ul>' + ''.join('<li>' + esc(rule) + '</li>' for rule in comparison.get('fairComparisonRules', [])) + '</ul></section>'

    content += '<section><h2>HTTP gameplay measurements</h2><p>Chosen assessment criteria: input p95 ≤100 ms, p99 ≤250 ms, '
    content += 'at least 95% of offered input slots delivered successfully by the deadline, below 1% unexpected errors, '
    content += 'valid snapshots and maintained occupancy. These are engineering targets for this assessment, not an industry standard.</p>'
    content += '<p>Each player is offered 20 input slots per second with at most one input request in flight. Skipped slots remain '
    content += 'in the denominator. Request timing includes completed errors and timeouts. The client and server share one host on loopback; '
    content += 'WAN latency, browser rendering, GPU load, VR, vehicle driving and production payment settlement are not exercised.</p>'
    content += svg_chart(stages, http, previous_stages)
    content += '<p class="caption">Cutoff stages are omitted from the chart. † Occupancy was not maintained or could not be verified. '
    content += 'Dark diamonds show only earlier complete stages with verified occupancy. Full observations, including cutoffs, appear below.</p>'
    rows = []
    for stage in stages:
        login = stage.get('kind') == 'login'
        timing = stage.get('latencyMs', {}) if login else stage.get('inputLatencyMs', {})
        timing_available = login or measured(stage)
        is_cutoff = cutoff(stage, http)
        suffix = ' †' if is_cutoff and timing_available else ''
        rows.append([stage['name'], stage.get('requestedPlayers', stage.get('requested', '—')),
                     stage.get('joinedPlayers', stage.get('successful', '—')),
                     presence(stage.get('occupancyBefore', {})) + ' / ' + presence(stage.get('occupancyAfter', {})) if not login else 'not a gameplay test',
                     num(timing.get('p50')) + suffix if timing_available else 'not measured',
                     num(timing.get('p95')) + suffix if timing_available else 'not measured',
                     num(timing.get('p99')) + suffix if timing_available else 'not measured',
                     pct(stage.get('deliveredSlotRatio')) + suffix if measured(stage) else 'not measured',
                     num(stage.get('successfulRequestsPerSecond')) + suffix if timing_available else 'not measured',
                     assessment(stage, http)])
    content += table(['Scenario', 'Requested', 'Join/login acknowledgments', 'Active before / after', 'p50 ms', 'p95 ms', 'p99 ms', 'Delivered slots', 'Successful req/s', 'Assessment'], rows)
    content += '<p class="caption">† Observations from an experiment-limited stage may include requests after termination and do not qualify '
    content += 'steady gameplay capacity. Failed occupancy replies mean unavailable, not zero concurrent players. Join acknowledgments may accumulate '
    content += 'while earlier players expire under load.</p></section>'

    content += '<section><h2>Repeat versus the first run</h2><p>Only complete movement stages with verified occupancy at both ends in both runs '
    content += 'are compared below. Both use 20 seconds and 241 stored accounts. Earlier batches used 180- or 90-second stage budgets; '
    content += 'the longer repeat budget can change which workloads reach measurement. Earlier interrupted stages and failed hockey occupancy '
    content += 'probes are excluded; the corrected hockey recheck supersedes its original result.</p>'
    if interruptions:
        content += '<p>The repeat also resumed after an external environment interruption. Matched stages use equivalent fixture counts and '
        content += 'structure, with different synthetic identities across batches; they do not share one uninterrupted execution or identical seeded files.</p>'
    paired = []
    for stage in stages:
        prior, prior_report = previous_stages.get(stage['name'], (None, None))
        if prior and complete_gameplay(stage, http) and complete_gameplay(prior, prior_report):
            paired.append([stage['name'], num(prior['inputLatencyMs'].get('p95')), num(stage['inputLatencyMs'].get('p95')),
                           pct(prior.get('deliveredSlotRatio')), pct(stage.get('deliveredSlotRatio')),
                           'met targets' if prior.get('pass') else 'outside targets', 'met targets' if stage.get('pass') else 'outside targets'])
    content += table(['Scenario', 'Previous p95 ms', 'Repeat p95 ms', 'Previous slot delivery', 'Repeat slot delivery', 'Previous assessment', 'Repeat assessment'], paired)
    content += '<p>This is a repeatability check of short runs, not a statistically powered regression study or a sustained production capacity certification.</p></section>'

    content += '<section><h2>Simulation compute budget</h2><p>The simulation test uses real production collision, room queues, cloning '
    content += 'and NPC logic, with unique synthetic player IDs in light park fixtures. There are no HTTP clients, authentication, '
    content += 'serialized network snapshots, economic settlement or timed disk writes. Twenty measured ticks represent one simulated second; '
    content += 'they are a compute-budget sample, not a sustained-player qualification. The clock advances in 50 ms steps without pacing sleeps. '
    content += 'Identical fixture structure repeated across rooms makes this a light population workload.</p>'
    sim_rows = []
    for stage in simulation.get('scenarios', []):
        count = stage.get('completedTicks', 0)
        timing = stage.get('tickWallMs', {})
        memory = stage.get('memory', {}).get('peakSampledRssBytes', stage.get('peakSampledRssBytes'))
        sim_rows.append([stage['scenario']['players'], stage['scenario']['roomCount'],
                         str(count) + '/' + str(stage.get('requestedTicks', simulation.get('options', {}).get('ticks', 20))),
                         num(timing.get('p95')) if count >= 20 else 'insufficient samples', num(timing.get('max')),
                         str(stage.get('deadline50ms', {}).get('hits', 0)) + '/' + str(count) if count else 'not measured',
                         num(memory / 1048576) if memory is not None else 'unavailable', stage.get('status')])
    content += table(['Synthetic players', 'Rooms', 'Measured ticks', 'Observed sample p95 ms', 'Max observed tick ms', 'Within 50 ms', 'Peak sampled RSS MiB', 'Experiment status'], sim_rows)
    content += '<p>With one observed tick, the maximum is that single measurement; a p95/p99 estimate is not meaningful. '
    content += 'A scenario marked completed finished its requested samples; it did not necessarily meet the 50 ms budget.</p></section>'

    content += '<section><h2>Persistence growth and correctness</h2><p>Stored users and rooms describe dataset size, not connected players. '
    content += 'Each workload issues 50 operations with at most 25 outstanding. Building mutations and economic spends include '
    content += 'the production stores; the separate room-counter workload measures store cloning and queues, not physics or gameplay.</p>'
    content += table(['Correctness invariant', 'Result'], [[item['name'], item['status']] for item in storage.get('correctness', [])])
    storage_rows = []
    for growth in storage.get('growth', []):
        for work in growth.get('workloads', []):
            storage_rows.append([str(growth['scale']['users']) + '/' + str(growth['scale']['storedRooms']), work['name'],
                                 str(work.get('completed')) + '/' + str(work.get('requested')), num(work.get('operationsPerSecond'), 3),
                                 num(work.get('latencyMs', {}).get('p95')), num(work.get('queueWaitMs', {}).get('p95')), work.get('status')])
    content += table(['Stored users / rooms', 'Workload', 'Completed', 'Ops/s', 'p95 operation ms', 'p95 queue wait ms', 'Correctness / completion'], storage_rows)
    content += '<p>Passed in this section means the operations and integrity assertions succeeded; it is not a latency acceptance grade. '
    content += 'The store serializes whole JSON datasets and writes temporary files followed by rename. The observed results do not establish '
    content += 'multi-process database safety or protection from arbitrary power loss.</p></section>'

    content += '<section><h2>Cold-login pressure</h2><p>The admission test offers 1,000 or 10,000 login attempts over 20 seconds, '
    content += 'with at most 128 requests in flight, an 8-second request timeout and a bounded drain. Attempts never issued because that '
    content += 'client-side cap was full are generator backpressure, not server rejections. Acknowledged authenticated logins are not active gameplay players. '
    content += 'Timed-out requests can still commit records on the server.</p>'
    content += table(['Offered attempts', 'Issued', 'Not issued: client cap', 'Authenticated by deadline', 'Authenticated including drain',
                      'Admissions/s by deadline', 'Request p95 ms', 'Assessment'], [
        [stage.get('offeredAttempts'), stage.get('attemptsIssued'), stage.get('droppedSlots'), stage.get('authenticatedByDeadline'),
         stage.get('authenticatedAdmissions'), num(stage.get('authenticatedAdmissionsPerSecond')), num(stage.get('requestLatencyMs', {}).get('p95')),
         'met chosen targets' if stage.get('pass') else 'outside chosen targets'] for stage in admission.get('stages', [])]) + '</section>'

    content += '<section><h2>Restart and mixed-ledger checks</h2><p>The restart test hard-kills a local server after waiting for a checkpoint, '
    content += 'then verifies session, inventory, balance, published map and saved position. It does not test an arbitrary in-flight financial crash '
    content += 'or power-loss durability. In-memory sports matches are outside this recovery assertion.</p>'
    recovery = http.get('recovery') or {}
    content += table(['Checkpointed restart check', 'Result'], [
        ['Overall checkpointed restart', 'passed' if recovery.get('pass') else 'failed or incomplete'],
        ['Session survived', recovery.get('sessionSurvived', 'unavailable')],
        ['Balance preserved', recovery.get('balancePreserved', 'unavailable')],
        ['Inventory preserved', recovery.get('inventoryPreserved', 'unavailable')],
        ['Published map preserved', recovery.get('publishedMapPreserved', 'unavailable')],
        ['Checkpointed position preserved', recovery.get('checkpointPreserved', 'unavailable')],
        ['Observed restart ms', num(recovery.get('restartMs'))],
    ])
    content += raw('Checkpointed restart results', recovery)
    for stage in stages:
        if stage.get('sideTraffic', {}).get('requests', 0):
            content += raw(stage['name'] + ': signed ledger reconciliation and side requests', stage['sideTraffic'])
    content += '<p>The original first-run mixed check considered debits alone and omitted automatic gameplay credits. Its balance flag '
    content += 'was inconclusive because the ledger was not retained. The repeat captures signed ledger entries and verifies acknowledged spend '
    content += 'IDs exactly once; a timeout is reported as inconclusive rather than automatically treated as lost money.</p>'
    content += '<p>This retest covers the listed pressure and integrity checks. The repository-wide functional suite was not rerun here; '
    content += 'the earlier incomplete regression run must not be represented as a fully passing test suite.</p></section>'

    content += '<section><h2>Engineering priorities suggested by the evidence</h2><ol>'
    content += '<li>Profile the gameplay request path and establish stable small-room performance with sustained end-to-end tests.</li>'
    content += '<li>Keep simulation and transient inputs in memory; schedule snapshots separately, send relevant state changes and bound queues.</li>'
    content += '<li>Move shared identities, sessions, inventory and economy into coordinated transactional storage, preserving idempotent receipts.</li>'
    content += '<li>Give rooms explicit ownership in independent workers and add routing, admission limits, metrics and recovery.</li>'
    content += '<li>Repeat production-equivalent tests for 128-player worlds and a room fleet before publishing larger capacity promises.</li></ol>'
    content += '<p>Whole-file persistence, repeated identity work and shared request/simulation queues are source-backed scaling concerns. '
    content += 'Their relative contribution has not been established by a profiler. Adding WebSockets or adopting another framework alone '
    content += 'does not guarantee the requested player counts.</p></section>'

    content += '<section><h2>Official comparison sources</h2><p>Technical documentation checked '
    content += esc(comparison.get('researchedAtDate')) + '. Features can change; the evidence below records the claims used in this report.</p>'
    for source in comparison.get('sources', []):
        content += '<article class="source" id="' + esc(source['id']) + '"><h3>' + esc(source['id']) + ': '
        content += '<a href="' + esc(source['url']) + '">' + esc(source['platform'] + ' — ' + source['title']) + '</a></h3>'
        content += '<blockquote>' + esc(source.get('excerpt', '')) + '</blockquote><ul>'
        content += ''.join('<li>' + esc(claim) + '</li>' for claim in source.get('claims', [])) + '</ul></article>'
    content += '</section><section><h2>Reproduce and inspect</h2><p>Each command creates temporary synthetic state and runs a local server '
    content += 'or production store classes. Retain the fixture size, timings, heap settings and source commit when comparing results.</p>'
    if interruptions:
        content += '<p>The command list records the externally interrupted first attempt and the commands used to resume it. '
        content += 'The workflow and embedded raw batches retain their separate execution statuses. A new full-profile command can repeat the '
        content += 'entire HTTP matrix from scratch; the merged result is assembled from the retained first-batch checkpoint and resumed scenarios.</p>'
    content += '<pre>' + esc('\n'.join(shlex.join(entry['argv']) for entry in workflow.get('commands', []))) + '</pre>'
    content += raw('Workflow: timestamps, commands, exit codes and measured harness hashes', workflow)
    for name, value in payload.items():
        if name != 'workflow':
            content += raw('Embedded evidence: ' + name, value)
    content += '</section>'
    css = '''body{font:16px/1.65 system-ui,-apple-system,sans-serif;color:#243243;background:#eef2f6;margin:0}main{max-width:1280px;margin:32px auto;background:#fff;padding:36px 40px;border-radius:16px;box-shadow:0 10px 40px #26384910}header{border-bottom:1px solid #dce4ed;padding-bottom:18px}.eyebrow{font-size:12px;font-weight:750;letter-spacing:.09em;color:#386489}h1{font-size:clamp(30px,4vw,44px);line-height:1.15;color:#13293f;max-width:900px}h2{font-size:24px;line-height:1.3;margin:0 0 14px;color:#183b57}h3{font-size:16px}.lead{font-size:20px;max-width:1050px}p{max-width:1120px}section{margin-top:38px}.notice{background:#edf5fb;border-left:4px solid #32749f;padding:16px 20px;margin-top:24px}.scroll{overflow:auto;border:1px solid #dde5ed;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.5}th,td{padding:11px 12px;text-align:left;border-bottom:1px solid #dde5ed;vertical-align:top}th{background:#edf2f7;font-weight:700;white-space:nowrap}tbody tr:nth-child(even){background:#f9fbfd}tbody tr:last-child td{border-bottom:0}td:first-child{font-weight:650}.caption{font-size:13px;color:#586779}a{color:#145c8f;text-underline-offset:3px}svg{max-width:100%;height:auto}pre{background:#f0f4f8;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.55;border-radius:6px}code{background:#eef2f6;padding:2px 5px;border-radius:4px;font-size:13px;overflow-wrap:anywhere}details{border:1px solid #dde5ed;border-radius:6px;margin:12px 0}summary{cursor:pointer;padding:12px 16px;font-weight:600}details pre{margin:0;border-radius:0}.source{border-top:1px solid #dde5ed;padding-top:8px;margin-top:18px}blockquote{border-left:3px solid #b8cad9;padding-left:14px;color:#53687b;font-size:14px}li{margin:7px 0}@media(max-width:700px){main{margin:0;padding:24px 16px;border-radius:0}h2{font-size:22px}.lead{font-size:18px}th,td{padding:9px}section{margin-top:30px}}@media print{body{background:#fff}main{margin:0;padding:0;box-shadow:none}details{display:none}.scroll{overflow:visible}table{font-size:9px}a{color:inherit}}'''
    document = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    document += '<title>MUZIKAZ server retest and platform comparison</title><style>' + css + '</style></head><body><main>' + content + '</main></body></html>'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(document)
    print(output)


if __name__ == '__main__':
    main()
