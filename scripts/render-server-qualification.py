#!/usr/bin/env python3
"""Build a portable server qualification report from completed isolated runs."""
import argparse
import hashlib
import html
import io
import json
import math
import shlex
import subprocess
from collections import Counter
from datetime import datetime
from pathlib import Path


def esc(value):
    return html.escape(str(value))


def num(value, digits=1):
    return '—' if value is None else f'{value:,.{digits}f}'


def pct(value):
    return '—' if value is None else num(value * 100, 3 if 0 < abs(value) < .001 else 2) + '%'


def stamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M UTC')
    except (AttributeError, ValueError):
        return str(value or 'unavailable')


def load(path):
    return json.loads(path.read_text()) if path.exists() else None


def manifest_digest(manifest):
    return hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()


def javascript_json_strings(values):
    """Preserve the production harness's JSON.stringify hashing/equality rules."""
    script = 'const fs=require("node:fs");const values=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(values.map(value=>JSON.stringify(value))));'
    try:
        result = subprocess.run(['node', '-e', script], input=json.dumps(values, allow_nan=False),
                                text=True, capture_output=True, check=True, timeout=10)
        encoded = json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise ValueError('Cannot verify production JSON serialization for recorded recovery state') from error
    if not isinstance(encoded, list) or len(encoded) != len(values) or any(not isinstance(value, str) for value in encoded):
        raise ValueError('Recovery JSON serialization returned inconsistent values')
    return encoded


def validate_source_identity(source, label):
    manifest = source.get('runtimeManifest') or {}
    if not manifest or source.get('runtimeSHA256') != manifest_digest(manifest):
        raise ValueError(label + ' runtime manifest digest is inconsistent')
    base = {key: value for key, value in source.items() if key != 'fingerprint'}
    if source.get('fingerprint') != manifest_digest(base):
        raise ValueError(label + ' source fingerprint is inconsistent')
    return manifest


def unique_records(records, key, label):
    identities = [key(record) for record in records]
    if not identities or any(identity is None or identity == '' for identity in identities) or len(set(identities)) != len(identities):
        raise ValueError(label + ' must contain unique identified records')


def validate_primary_evidence(current, regressions=None):
    """Bind every primary family and optional correctness run to one runtime."""
    workflow = current['workflow']
    manifest = workflow.get('runtimeManifest') or {}
    digest = workflow.get('runtimeSourceSHA256')
    if workflow.get('diagnosticOnly') or not manifest or digest != manifest_digest(manifest):
        raise ValueError('Primary workflow is diagnostic-only or has an inconsistent runtime manifest')
    families = ('http', 'simulation', 'storage', 'admission')
    commands = workflow.get('commands') or []
    if len(commands) != len(families) or {command.get('name') for command in commands} != set(families):
        raise ValueError('Primary workflow must contain exactly one command for each experiment family')
    for command in commands:
        if command.get('status') != 'finished' or not command.get('finishedAt') or command.get('sourceUnchanged') is not True or not isinstance(command.get('exitCode'), int):
            raise ValueError('Primary workflow command is incomplete or its source changed: ' + str(command.get('name')))
    harnesses = workflow.get('harnesses') or {}
    scripts = {'http': 'scripts/pressure-test-server.mjs', 'simulation': 'scripts/pressure-test-simulation.mjs',
               'storage': 'scripts/pressure-test-storage.mjs', 'admission': 'scripts/pressure-test-admission.mjs'}
    for command in commands:
        script = scripts[command['name']]
        argv = command.get('argv') or []
        if len(argv) < 2 or Path(argv[0]).name != 'node' or argv[1] != script or not harnesses.get(script):
            raise ValueError('Primary workflow command does not identify its recorded harness: ' + command['name'])
    for family in families:
        report = current[family]
        if report.get('runtimeSourceSHA256') != digest or report.get('runtimeSourceUnchangedDuringRun') is not True:
            raise ValueError('Primary family does not match unchanged workflow runtime: ' + family)
        if report.get('sourceCommit', workflow.get('sourceCommit')) != workflow.get('sourceCommit'):
            raise ValueError('Primary family source commit differs from workflow: ' + family)
    for family, script in [('http', 'scripts/pressure-test-server.mjs'), ('admission', 'scripts/pressure-test-admission.mjs')]:
        if not harnesses.get(script) or current[family].get('harnessSHA256') != harnesses[script]:
            raise ValueError('Primary family harness differs from workflow: ' + family)
    unique_records(current['http'].get('scenarios', []), lambda stage: stage.get('name'), 'HTTP scenarios')
    unique_records(current['simulation'].get('scenarios', []), lambda stage: stage.get('scenario', {}).get('players'), 'Simulation scenarios')
    unique_records(current['storage'].get('correctness', []), lambda stage: stage.get('name'), 'Storage integrity checks')
    unique_records(current['storage'].get('growth', []), lambda stage: stage.get('scale', {}).get('users'), 'Storage growth scales')
    for growth in current['storage'].get('growth', []):
        unique_records(growth.get('workloads', []), lambda stage: stage.get('name'), 'Storage growth workloads')
    unique_records(current['admission'].get('stages', []), lambda stage: stage.get('offeredAttempts'), 'Admission scenarios')
    if regressions:
        regression_source = regressions.get('source') or {}
        regression_manifest = validate_source_identity(regression_source, 'Regression')
        for path, expected in {**manifest, **harnesses}.items():
            if regression_manifest.get(path) != expected:
                raise ValueError('Regression runtime or harness differs from primary capacity evidence: ' + path)
        declared = regression_source.get('testCommands')
        if declared:
            tests = regressions.get('tests') or {}
            if set(declared) != set(tests) or len(tests) != regressions.get('requestedFiles'):
                raise ValueError('Regression records do not cover the declared per-file commands')
            for name, command in declared.items():
                record = tests[name]
                if any(record.get(key) != command.get(key) for key in ('argv', 'testTimeoutMs', 'outerTimeoutSeconds')):
                    raise ValueError('Regression command or deadline differs from its declaration: ' + name)


def validate_supplement_evidence(report, workflow):
    """Validate a separately labeled HTTP run without merging source revisions."""
    if not report or not report.get('finishedAt') or not workflow or not workflow.get('finishedAt'):
        raise ValueError('Supplemental HTTP requires a complete result and adjacent workflow.json')
    manifest = workflow.get('runtimeManifest') or {}
    digest = workflow.get('runtimeSourceSHA256')
    if workflow.get('diagnosticOnly') or not manifest or digest != manifest_digest(manifest):
        raise ValueError('Supplemental workflow is diagnostic-only or has an inconsistent runtime manifest')
    if not workflow.get('sourceCommit') or report.get('sourceCommit') != workflow['sourceCommit']:
        raise ValueError('Supplemental HTTP source commit differs from its workflow')
    if report.get('runtimeSourceSHA256') != digest or report.get('runtimeSourceUnchangedDuringRun') is not True:
        raise ValueError('Supplemental HTTP does not match its unchanged workflow runtime')
    script = 'scripts/pressure-test-server.mjs'
    harness_hash = (workflow.get('harnesses') or {}).get(script)
    if not harness_hash or report.get('harnessSHA256') != harness_hash:
        raise ValueError('Supplemental HTTP harness differs from its workflow')
    commands = workflow.get('commands') or []
    http_commands = [command for command in commands if command.get('name') == 'http']
    if len(http_commands) != 1:
        raise ValueError('Supplemental workflow must contain exactly one HTTP command')
    for command in commands:
        if command.get('status') != 'finished' or not command.get('finishedAt') or command.get('sourceUnchanged') is not True or not isinstance(command.get('exitCode'), int):
            raise ValueError('Supplemental workflow command is incomplete or its source changed: ' + str(command.get('name')))
    argv = http_commands[0].get('argv') or []
    if len(argv) < 2 or Path(argv[0]).name != 'node' or argv[1] != script:
        raise ValueError('Supplemental HTTP command does not identify its recorded harness')
    unique_records(report.get('scenarios', []), lambda stage: stage.get('name'), 'Supplemental HTTP scenarios')


def validate_bound_evidence(standard, report, label):
    """Require completed checks to use the standard regression's exact source."""
    if not standard:
        raise ValueError(label + ' requires completed --regressions evidence')
    if not report or not report.get('finishedAt'):
        raise ValueError(label + ' must exist and be complete')
    if report.get('runtimeChangedDuringRun') is not False:
        raise ValueError(label + ' runtime source was not verified unchanged')
    expected_source = standard.get('source') or {}
    actual_source = report.get('source') or {}
    validate_source_identity(expected_source, 'Regression')
    validate_source_identity(actual_source, label)
    if standard.get('executionScope') == 'selected':
        # Selected checks can capture the same staged bytes immediately before
        # their commit. Preserve both commit labels, but require identical code,
        # assets, helpers, runner, guard and declared selected commands.
        if any(actual_source.get(key) != value for key, value in expected_source.items() if key not in ('sourceCommit', 'fingerprint')):
            raise ValueError(label + ' differs from the selected regression application or execution identity')
        return
    for key in ('runtimeSHA256', 'node', 'guardSHA256', 'runnerSHA256', 'fingerprint'):
        if not expected_source.get(key) or actual_source.get(key) != expected_source[key]:
            raise ValueError(label + ' source does not match standard evidence: ' + key)


def validate_extended_regression(standard, extended):
    """Bind a separate long-budget attempt to the original source and test."""
    validate_bound_evidence(standard, extended, 'Extended regression')
    if extended.get('testUnchanged') is not True:
        raise ValueError('Extended regression test source was not verified unchanged')
    test_path = extended.get('test', '')
    test_name = Path(test_path).name
    if test_path != 'test/' + test_name or not test_name.endswith('.test.mjs'):
        raise ValueError('Extended regression must identify a test/<name>.test.mjs file')
    expected_test = standard.get('tests', {}).get(test_name) or {}
    if not expected_test.get('testSHA256') or extended.get('testSHA256') != expected_test['testSHA256']:
        raise ValueError('Extended regression test hash does not match the standard attempt')
    if extended.get('status') not in ('passed', 'failed', 'timeout'):
        raise ValueError('Extended regression has no final status')
    if extended.get('status') == 'passed':
        footer = extended.get('testCases', {}).get('footer') or {}
        if extended.get('exitCode') != 0 or not footer.get('tests') or footer.get('fail', 0) or footer.get('cancelled', 0):
            raise ValueError('Extended regression pass is inconsistent with its exit code or TAP summary')
    return test_name, expected_test


def validate_browser_regressions(standard, report):
    if not standard:
        raise ValueError('Browser regressions require completed --regressions evidence')
    if not report or not report.get('finishedAt') or report.get('runtimeChangedDuringRun') is not False:
        raise ValueError('Browser regressions must be complete with source verified unchanged')
    expected_source = standard.get('source') or {}
    actual_source = report.get('source') or {}
    expected_manifest = expected_source.get('runtimeManifest') or {}
    actual_manifest = actual_source.get('runtimeManifest') or {}
    selected = standard.get('executionScope') == 'selected'
    checks = report.get('checks') or []
    hashes = actual_source.get('testHashes') or {}
    names = [check.get('name') for check in checks]
    selected = standard.get('executionScope') == 'selected'
    if not checks or len(set(names)) != len(names) or (not set(names).issubset(hashes) if selected else set(names) != set(hashes)):
        raise ValueError('Browser checks must cover the unique declared test hashes')
    if any(not isinstance(name, str) or name != Path(name).name or not name.endswith('.browser.py') for name in names):
        raise ValueError('Browser checks must identify standalone <name>.browser.py fixtures')
    if not expected_manifest or not actual_manifest:
        raise ValueError('Browser binding requires complete standard and browser manifests')
    for key, value in expected_source.items():
        if key not in ('runtimeManifest', 'runtimeSHA256', 'fingerprint', *(('sourceCommit',) if selected else ())) and actual_source.get(key) != value:
            raise ValueError('Browser source does not match standard evidence: ' + key)
    # Browser runners append metadata after computing the base Node fingerprint.
    # Recompute both base identities before permitting any fixture-only changes.
    for source in (expected_source, actual_source):
        manifest_hash = hashlib.sha256(json.dumps(source['runtimeManifest'], sort_keys=True).encode()).hexdigest()
        base = {key: source.get(key) for key in expected_source if key != 'fingerprint'}
        fingerprint = hashlib.sha256(json.dumps(base, sort_keys=True).encode()).hexdigest()
        if source.get('runtimeSHA256') != manifest_hash or source.get('fingerprint') != fingerprint:
            raise ValueError('Browser/standard source manifest or fingerprint is inconsistent')
    fixture_paths = {'test/' + name for name in names}
    if selected and expected_manifest != actual_manifest:
        raise ValueError('Selected browser and Node checks must use identical application/assets/helper bytes')
    differences = []
    for path in sorted(set(expected_manifest) | set(actual_manifest)):
        old, new = expected_manifest.get(path), actual_manifest.get(path)
        if old != new:
            if path not in fixture_paths or not old or new != hashes[Path(path).name]:
                raise ValueError('Browser source differs outside declared existing browser fixtures: ' + path)
            differences.append([path, old, new])
    for check in checks:
        name = check['name']
        if name != Path(name).name or not check.get('finishedAt') or check.get('status') not in ('passed', 'failed', 'timeout'):
            raise ValueError('Browser check is missing a completed final status: ' + str(name))
        if check.get('testUnchanged') is not True or not hashes.get(name) or check.get('testSHA256') != hashes[name] or actual_manifest.get('test/' + name) != hashes[name]:
            raise ValueError('Browser test hash does not match unchanged browser source: ' + name)
        if check.get('status') == 'passed' and check.get('exitCode') != 0:
            raise ValueError('Browser check pass disagrees with its exit code: ' + name)
    return differences


def validate_static_checks(standard, report):
    validate_bound_evidence(standard, report, 'Static checks')
    commands = report.get('commands') or []
    if not commands or any(not command.get('argv') or not isinstance(command.get('exitCode'), int) for command in commands):
        raise ValueError('Static checks must contain completed commands and exit codes')


def validate_recovery_diagnostic(current, report, provenance, result_path):
    """Keep instrumented recovery evidence separate and bound to its exact code."""
    if not report or not report.get('finishedAt') or report.get('diagnosticOnly') is not True or report.get('scenarios'):
        raise ValueError('Recovery diagnostic must be complete, diagnostic-only and contain no gameplay pressure stages')
    workflow = current['workflow']
    if not provenance or provenance.get('diagnosticOnly') is not True or provenance.get('processExited') is not True:
        raise ValueError('Recovery diagnostic requires completed sibling provenance')
    for key in ('runtimeManifestUnchangedAtDiagnosticStart', 'runtimeManifestUnchangedAfterDiagnostic', 'canonicalHarnessUnchanged'):
        if provenance.get(key) is not True:
            raise ValueError('Recovery diagnostic source was not verified unchanged: ' + key)
    if provenance.get('changedRuntimeFiles') != [] or provenance.get('changedRuntimeFilesAfter') != []:
        raise ValueError('Recovery diagnostic runtime changed')
    if provenance.get('runtimeManifest') != workflow.get('runtimeManifest') or provenance.get('runtimeSourceSHA256') != workflow.get('runtimeSourceSHA256'):
        raise ValueError('Recovery diagnostic runtime differs from primary evidence')
    if manifest_digest(provenance['runtimeManifest']) != provenance['runtimeSourceSHA256']:
        raise ValueError('Recovery diagnostic runtime manifest digest is inconsistent')
    if report.get('sourceCommit') != workflow.get('sourceCommit') or provenance.get('sourceCommit') != workflow.get('sourceCommit'):
        raise ValueError('Recovery diagnostic source commit differs from primary evidence')
    node = current['http'].get('environment', {}).get('node')
    if not node or provenance.get('node') != node or report.get('environment', {}).get('node') != node:
        raise ValueError('Recovery diagnostic Node version differs from primary evidence')
    for kind, path in [('canonicalHarness', 'scripts/pressure-test-server.mjs'), ('canonicalProbe', 'scripts/pressure-test-probe.mjs')]:
        if provenance.get(kind + 'Path') != path or provenance.get(kind + 'SHA256') != workflow.get('harnesses', {}).get(path):
            raise ValueError('Recovery diagnostic canonical harness differs from primary evidence: ' + path)
    root = Path(__file__).resolve().parents[1]
    script_path = (root / provenance.get('diagnosticHarnessPath', '')).resolve()
    if not script_path.is_relative_to(root) or not script_path.is_file():
        raise ValueError('Recovery diagnostic script must exist inside the repository workspace')
    script = script_path.read_bytes()
    digest = hashlib.sha256(script).hexdigest()
    if digest != provenance.get('diagnosticHarnessSHA256') or digest != report.get('harnessSHA256'):
        raise ValueError('Recovery diagnostic script hash differs from recorded evidence')
    if (root / provenance.get('resultPath', '')).resolve() != result_path.resolve() or hashlib.sha256(result_path.read_bytes()).hexdigest() != provenance.get('resultSHA256'):
        raise ValueError('Recovery diagnostic result path or digest is inconsistent')
    argv = provenance.get('argv') or []
    if len(argv) < 2 or Path(argv[0]).name != 'node' or Path(argv[1]).resolve() != script_path or '--output=' + str(result_path.resolve()) not in argv:
        raise ValueError('Recovery diagnostic command does not identify its script and result')
    attempts = report.get('recoveryAttempts') or []
    if not attempts:
        raise ValueError('Recovery diagnostic contains no completed attempts')
    for attempt in attempts:
        diagnostic = attempt.get('diagnostic') or {}
        values = [diagnostic.get(key) for key in ('preMovementBalance', 'immediatePreKillBalance', 'afterRestartBalance', 'movementDelta', 'netSignedMovementReceipts')]
        if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in values):
            raise ValueError('Recovery diagnostic requires finite recorded balances and receipt totals')
        before, at_kill, after, delta, net = values
        receipts = diagnostic.get('movementReceipts')
        if not isinstance(receipts, list) or any(not isinstance(receipt.get('amountMzk'), (int, float)) for receipt in receipts):
            raise ValueError('Recovery diagnostic requires signed movement receipts')
        if delta != at_kill - before or net != sum(receipt['amountMzk'] for receipt in receipts):
            raise ValueError('Recovery diagnostic movement totals disagree with balances or receipts')
        if diagnostic.get('originalEquality') is not (before == after) or attempt.get('balancePreserved') is not (before == after):
            raise ValueError('Recovery diagnostic original comparison was changed')
        if diagnostic.get('exactBalancePreservedAtKill') is True and at_kill != after:
            raise ValueError('Recovery diagnostic exact prekill balance comparison is inconsistent')
        if diagnostic.get('coinCreditExplainsDifference') is True and not (delta > 0 and delta == net and receipts and all(receipt.get('type') == 'MZK_COIN' and receipt['amountMzk'] == 1 for receipt in receipts) and at_kill == after):
            raise ValueError('Recovery diagnostic coin-credit explanation is inconsistent')
    return script.decode()


def verified_helper_source(path, expected_hash, label):
    """Embed an optional local helper only when its recorded digest matches."""
    if not expected_hash or not path.is_file():
        return None
    source = path.read_bytes()
    if hashlib.sha256(source).hexdigest() != expected_hash:
        raise ValueError(label + ' helper differs from the recorded verification source: ' + str(path))
    return {'path': str(path), 'sha256': expected_hash, 'source': source.decode()}


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


def freshness(stage):
    value = stage.get('frameFreshness') or {}
    age = value.get('ageMs') or {}
    if not age.get('count'):
        return 'not measured' if stage.get('kind') != 'login' else 'login test only'
    return num(age.get('p95')) + ' / ' + str(age['count']) + ' samples'


def http_table(stages, report):
    rows = []
    for stage in stages:
        login = stage.get('kind') == 'login'
        timing = stage.get('latencyMs', {}) if login else stage.get('inputLatencyMs', {})
        available = login or measured(stage)
        suffix = ' †' if cutoff(stage, report) and available else ''
        rows.append([name(stage), stage.get('requestedPlayers', stage.get('requested', '—')),
                     stage.get('joinedPlayers', stage.get('successful', '—')),
                     'login test only' if login else presence(stage.get('occupancyBefore', {})) + ' / ' + presence(stage.get('occupancyAfter', {})),
                     num(timing.get('p95')) + suffix if available else 'not measured',
                     num(timing.get('p99')) + suffix if available else 'not measured',
                     pct(stage.get('deliveredSlotRatio')) + suffix if measured(stage) else 'not measured',
                     freshness(stage), num(stage.get('snapshotHydrationMs', {}).get('p95')), assessment(stage, report)])
    return table(['Workload', 'Requested players', 'Join/login acknowledgments', 'Presence before / after',
                  'Request p95 ms', 'Request p99 ms', 'Delivered slots', 'Frame-age p95 ms / sample count',
                  'Hydration p95 ms', 'Assessment'], rows)


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


def validate_release_regressions(workflow, report):
    """Bind a completed correctness campaign to an HTTP-only release run."""
    if not report or not report.get('finishedAt') or report.get('runtimeChangedDuringRun') is not False:
        raise ValueError('Release regressions must be complete with source verified unchanged')
    source = report.get('source') or {}
    manifest = validate_source_identity(source, 'Release regression')
    if manifest != workflow['runtimeManifest'] or source.get('runtimeSHA256') != workflow.get('runtimeSourceSHA256'):
        raise ValueError('Release HTTP and regression campaigns must use the exact full application/assets/helper manifest')
    for path, digest in {**workflow['runtimeManifest'], **workflow.get('harnesses', {})}.items():
        if manifest.get(path) != digest:
            raise ValueError('Release regression differs from HTTP runtime or harness: ' + path)
    declared, tests = source.get('testCommands') or {}, report.get('tests') or {}
    selected_scope = report.get('executionScope') == 'selected' or source.get('executionScope') == 'selected'
    if not declared or not tests or len(tests) != report.get('requestedFiles') or (not set(tests).issubset(declared) if selected_scope else set(declared) != set(tests)):
        raise ValueError('Release regressions must cover every declared per-file command')
    if selected_scope:
        names, available = report.get('selectedTestFiles') or [], report.get('availableTestFiles')
        if report.get('executionScope') != 'selected' or source.get('executionScope') != 'selected' or report.get('complete') is not False or source.get('complete') is not False:
            raise ValueError('Selected regressions must explicitly retain incomplete full-suite coverage')
        if not isinstance(available, int) or isinstance(available, bool) or available < len(tests) or source.get('availableTestFiles') != available or len(declared) != available:
            raise ValueError('Selected regression available-file counts are inconsistent')
        if len(names) != len(set(names)) or set(names) != set(tests) or source.get('selectedTestFiles') != names:
            raise ValueError('Selected regression coverage differs from the executed files')
    outcomes, totals, complete_summaries = Counter(), Counter(), 0
    keys = ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo')
    for name, record in tests.items():
        if record.get('status') not in ('passed', 'failed', 'timeout', 'interrupted', 'runner-error') or not record.get('finishedAt'):
            raise ValueError('Release regression has no completed final status: ' + name)
        if any(record.get(key) != declared[name].get(key) for key in ('argv', 'testTimeoutMs', 'outerTimeoutSeconds')):
            raise ValueError('Release regression command or deadline differs from its declaration: ' + name)
        if not isinstance(record.get('testSHA256'), str) or len(record['testSHA256']) != 64:
            raise ValueError('Release regression is missing its test hash: ' + name)
        outcomes[record['status']] += 1
        footer = (record.get('testCases') or {}).get('footer')
        if footer:
            if any(not isinstance(footer.get(key), int) or isinstance(footer[key], bool) or footer[key] < 0 for key in keys):
                raise ValueError('Release regression TAP summary is invalid: ' + name)
            if footer['tests'] != sum(footer[key] for key in keys[1:]):
                raise ValueError('Release regression TAP counts do not add up: ' + name)
            totals.update({key: footer[key] for key in keys})
            complete_summaries += 1
        if record['status'] == 'passed' and (record.get('exitCode') != 0 or not footer or not footer['tests'] or footer['fail'] or footer['cancelled']):
            raise ValueError('Release regression pass disagrees with its exit code or TAP summary: ' + name)
    summary = report.get('summary') or {}
    if any(summary.get(key, 0) != value for key, value in outcomes.items()) or any(value != outcomes.get(key, 0) for key, value in summary.items()):
        raise ValueError('Release regression file totals disagree with the recorded outcomes')
    if set(report.get('testCaseTotals') or {}) != set(keys) or any(report['testCaseTotals'][key] != totals[key] for key in keys) or report.get('filesWithCompleteTestCaseSummary') != complete_summaries:
        raise ValueError('Release regression case totals disagree with the per-file TAP summaries')


def validate_release_recovery(recovery):
    """Check the corrected pre-kill boundary without changing failed outcomes."""
    checks = ('sessionSurvived', 'balancePreserved', 'walletReceiptsPreserved', 'movementBalanceReconciles',
              'inventoryPreserved', 'publishedMapPreserved', 'checkpointPreserved')
    if not recovery or recovery.get('status') != 'completed':
        preservation_checks = tuple(key for key in checks if key != 'movementBalanceReconciles')
        if recovery and any(recovery.get(key) is True for key in ('pass', *preservation_checks)):
            raise ValueError('Incomplete release recovery cannot claim a preservation pass')
        return
    ledgers = [recovery.get(key) for key in ('preMovementLedger', 'preKillLedger', 'postRestartLedger')]
    if any(not isinstance(ledger, dict) or not isinstance(ledger.get('receipts'), list) or
           ledger.get('receiptCount') != len(ledger['receipts']) or not isinstance(ledger.get('receiptSHA256'), str) or
           len(ledger['receiptSHA256']) != 64 for ledger in ledgers):
        raise ValueError('Completed release recovery requires complete recorded wallet ledgers')
    before_movement, before_kill, after_restart = [recovery.get(key) for key in ('preMovementBalanceMzk', 'beforeKillBalanceMzk', 'afterRestartBalanceMzk')]
    values = [before_movement, before_kill, after_restart, recovery.get('movementNetMzk'), *(ledger.get('balanceMzk') for ledger in ledgers)]
    if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in values):
        raise ValueError('Completed release recovery requires finite recorded balances')
    if any(not isinstance(receipt, dict) or not isinstance(receipt.get('id'), str) or not receipt['id'] or
           not isinstance(receipt.get('amountMzk'), (int, float)) or isinstance(receipt['amountMzk'], bool) or
           not math.isfinite(receipt['amountMzk']) for ledger in ledgers for receipt in ledger['receipts']):
        raise ValueError('Release recovery receipts must have nonempty string IDs and finite signed amounts')
    encoded = javascript_json_strings([*(ledger['receipts'] for ledger in ledgers),
                                      recovery.get('beforeKillInventory'), recovery.get('afterRestartInventory'),
                                      recovery.get('savedPosition'), recovery.get('restoredPosition')])
    if any(hashlib.sha256(value.encode()).hexdigest() != ledger['receiptSHA256'] for value, ledger in zip(encoded, ledgers)):
        raise ValueError('Release recovery receipt digest differs from its recorded receipt array')
    counts = [Counter(receipt.get('id') for receipt in ledger['receipts']) for ledger in ledgers]
    valid_ids = all(isinstance(receipt.get('id'), str) and receipt['id'] for ledger in ledgers[1:] for receipt in ledger['receipts'])
    same_receipts = encoded[1] == encoded[2]
    duplicates = {key for count in counts[1:] for key, value in count.items() if value > 1}
    expected_missing = {key for key, value in counts[1].items() if counts[2].get(key, 0) < value}
    expected_extra = {key for key, value in counts[2].items() if value > counts[1].get(key, 0)}
    if set(recovery.get('missingReceiptIds', [])) != expected_missing or set(recovery.get('unexpectedReceiptIds', [])) != expected_extra or set(recovery.get('duplicatedReceiptIds', [])) != duplicates:
        raise ValueError('Release recovery receipt diagnostics disagree with the recorded ledgers')
    expected_balance = before_kill == after_restart == ledgers[1]['balanceMzk'] == ledgers[2]['balanceMzk']
    if recovery.get('balancePreserved') is not expected_balance or recovery.get('walletReceiptsPreserved') is not (valid_ids and not duplicates and same_receipts):
        raise ValueError('Release recovery preservation flags disagree with the saved balances or receipts')
    if recovery.get('preMovementBalanceEqualAfterRestart') is not (before_movement == after_restart):
        raise ValueError('Release recovery pre-movement diagnostic is inconsistent')
    if before_movement != ledgers[0]['balanceMzk']:
        raise ValueError('Release recovery pre-movement API and durable ledger balances differ')
    previous_ids = {receipt['id'] for receipt in ledgers[0]['receipts']}
    movement = [receipt for receipt in ledgers[1]['receipts'] if receipt['id'] not in previous_ids]
    net = sum(receipt['amountMzk'] for receipt in movement)
    credits = sum(max(0, receipt['amountMzk']) for receipt in movement)
    debits = sum(min(0, receipt['amountMzk']) for receipt in movement)
    if recovery.get('movementReceipts') != movement or recovery['movementNetMzk'] != net or recovery.get('movementCreditsMzk') != credits or recovery.get('movementDebitsMzk') != debits or recovery.get('movementBalanceDeltaMzk') != before_kill - before_movement:
        raise ValueError('Release recovery movement diagnostics differ from the signed ledger changes')
    expected_reconciliation = before_kill == before_movement + recovery['movementNetMzk']
    if recovery.get('movementBalanceReconciles') is not expected_reconciliation:
        raise ValueError('Release recovery movement reconciliation is inconsistent')
    before_inventory, after_inventory = recovery.get('beforeKillInventory'), recovery.get('afterRestartInventory')
    expected_inventory = isinstance(before_inventory, list) and bool(before_inventory) and encoded[3] == encoded[4]
    if recovery.get('inventoryPreserved') is not expected_inventory:
        raise ValueError('Release recovery inventory outcome disagrees with the recorded inventories')
    finite_point = lambda point: isinstance(point, dict) and all(isinstance(point.get(axis), (int, float)) and not isinstance(point[axis], bool) and math.isfinite(point[axis]) for axis in ('x', 'y', 'z'))
    expected_position = finite_point(recovery.get('savedPosition')) and finite_point(recovery.get('restoredPosition')) and encoded[5] == encoded[6]
    if recovery.get('checkpointPreserved') is not expected_position:
        raise ValueError('Release recovery position outcome disagrees with the recorded checkpoint')
    if any(not isinstance(recovery.get(key), bool) for key in checks) or recovery.get('pass') is not all(recovery[key] for key in checks):
        raise ValueError('Release recovery overall outcome disagrees with the individual checks')


def bound_workspace_json(relative_path, expected_digest, label):
    root = Path(__file__).resolve().parents[1]
    path = (root / str(relative_path)).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(label + ' must exist inside the repository workspace')
    raw = path.read_bytes()
    if not isinstance(expected_digest, str) or hashlib.sha256(raw).hexdigest() != expected_digest:
        raise ValueError(label + ' digest differs from its recorded artifact')
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(label + ' must contain a JSON object')
    return value


def validate_verification_resume(workflow, final, result_path, report):
    """Keep the original command outcome distinct from a fixture-only resume."""
    if not report or not report.get('finishedAt') or report.get('runtimeChangedDuringRun') is not False:
        raise ValueError('Verification resume must be complete with application source verified unchanged')
    source = report.get('source') or {}
    validate_source_identity(source, 'Verification resume')
    if source.get('fingerprint') != final['source'].get('fingerprint') or report.get('sourceAfterFingerprint') != source.get('fingerprint'):
        raise ValueError('Verification resume changed the application, runner, guard or declared commands')
    if report.get('executionMatchesDeclaredReruns') is not True or report.get('testHashesMatchDeclaredReruns') is not True:
        raise ValueError('Verification resume did not verify its executed fixtures and hashes')
    if hashlib.sha256(result_path.read_bytes()).hexdigest() != report.get('finalResultsSHA256'):
        raise ValueError('Verification resume does not identify the supplied final checkpoint')
    original = bound_workspace_json(report.get('originalWorkflowPath'), report.get('originalWorkflowSHA256'), 'Original verification workflow')
    before = bound_workspace_json(report.get('sourceCheckpointBefore'), report.get('sourceCheckpointBeforeSHA256'), 'Archived pre-resume checkpoint')
    validate_release_regressions(workflow, before)
    if before['source'].get('fingerprint') != source['fingerprint'] or not original.get('finishedAt'):
        raise ValueError('Verification resume does not follow a complete identical-source campaign')
    node_commands = [item for item in original.get('commands', []) if item.get('name') == 'node-regressions']
    initial, command = report.get('initialNodeCommand') or {}, report.get('command') or {}
    if len(node_commands) != 1 or node_commands[0] != initial:
        raise ValueError('Verification resume original Node command differs from the archived workflow')
    for label, item in [('Original Node command', initial), ('Fixture resume command', command)]:
        if not item.get('finishedAt') or item.get('status') not in ('passed', 'failed', 'timeout') or not isinstance(item.get('exitCode'), int) or isinstance(item['exitCode'], bool):
            raise ValueError(label + ' must retain its completed status and exit code')
        if (item['status'] == 'passed') is not (item['exitCode'] == 0):
            raise ValueError(label + ' status disagrees with its exit code')
    if initial['exitCode'] == 0 and before.get('summary', {}).get('passed') != before.get('requestedFiles'):
        raise ValueError('Original Node command cannot claim success over a non-passing checkpoint')
    if command['exitCode'] == 0 and final.get('summary', {}).get('passed') != final.get('requestedFiles'):
        raise ValueError('Fixture resume command cannot claim success over a non-passing final checkpoint')
    if command.get('argv') != initial.get('argv'):
        raise ValueError('Fixture resume does not execute the same source-bound runner command')
    try:
        parse = lambda value: datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parse(command['startedAt']) < parse(original['finishedAt']) or parse(command['finishedAt']) < parse(command['startedAt']):
            raise ValueError('Fixture resume overlaps the original workflow or has reversed timestamps')
    except (KeyError, AttributeError, TypeError, ValueError) as error:
        raise ValueError('Fixture resume requires a valid sequential command window') from error
    reruns = report.get('rerunFiles') or []
    unique_records(reruns, lambda item: item.get('name'), 'Fixture resume records')
    names = {item['name'] for item in reruns}
    executed = report.get('executedFiles') or []
    if len(executed) != len(set(executed)) or set(executed) != names:
        raise ValueError('Fixture resume executed files differ from its declared reruns')
    if set(before['tests']) != set(final['tests']):
        raise ValueError('Fixture resume changed the declared test-file coverage')
    observed = {name for name, item in final['tests'].items() if item.get('log') != before['tests'][name].get('log')}
    if observed != names:
        raise ValueError('Fixture resume result logs differ outside the declared reruns')
    for item in reruns:
        name = item['name']
        previous, current = before['tests'][name], final['tests'][name]
        if item.get('previousStatus') != previous.get('status') or item.get('previousSHA256') != previous.get('testSHA256') or item.get('currentSHA256') != current.get('testSHA256') or item.get('previousSHA256') == item.get('currentSHA256'):
            raise ValueError('Fixture resume hashes or previous outcome disagree with the checkpoints: ' + name)
        prior = {key: value for key, value in previous.items() if key != 'earlierAttempts'}
        if prior not in current.get('earlierAttempts', []):
            raise ValueError('Fixture resume lost its earlier per-file attempt: ' + name)
    for name in set(final['tests']) - names:
        if final['tests'][name] != before['tests'][name]:
            raise ValueError('Fixture resume modified a retained test proof: ' + name)
    return original, before


def render_release_summary(args):
    directory = args.directory.resolve()
    http, workflow = load(directory / 'http.json'), load(directory / 'workflow.json')
    regressions = load(args.regressions) if args.regressions else None
    static = load(args.static_checks) if args.static_checks else None
    browser = load(args.browser_regressions) if args.browser_regressions else None
    validate_supplement_evidence(http, workflow)
    if len(workflow.get('commands', [])) != 1:
        raise ValueError('Release-summary mode requires exactly one HTTP experiment family')
    validate_release_regressions(workflow, regressions)
    if http.get('environment', {}).get('node') != regressions['source'].get('node'):
        raise ValueError('Release HTTP and regression Node versions differ')
    validate_static_checks(regressions, static)
    expected_static = {('npm', 'run', name) for name in ('build', 'check', 'check:asset-registry')}
    commands = [tuple(command['argv']) for command in static['commands']]
    if len(commands) != 3 or set(commands) != expected_static:
        raise ValueError('Release summary requires build, check and asset-registry checks exactly once')
    fixture_changes = validate_browser_regressions(regressions, browser)
    expected_browser = {'construction-control-recovery.browser.py', 'live-motion.browser.py',
                        'transport-startup.browser.py', 'world-input-recovery.browser.py'}
    selected_browser = browser.get('executionScope') == 'selected'
    if selected_browser:
        names, declared = browser.get('selectedChecks') or [], browser.get('declaredCommands') or {}
        if browser.get('complete') is not False or len(names) != len(set(names)) or not {check['name'] for check in browser['checks']}.issubset(names) or set(names) != set(declared) or set(names) != set(browser['source'].get('testHashes', {})) or not set(names).issubset(expected_browser):
            raise ValueError('Selected browser coverage must match its declared affected checks')
        if any(any(check.get(key) != declared[check['name']].get(key) for key in ('argv', 'outerTimeoutSeconds')) for check in browser['checks']):
            raise ValueError('Selected browser command or deadline differs from its declaration')
    elif {check['name'] for check in browser['checks']} != expected_browser:
        raise ValueError('Release summary requires all four selected browser checks')
    recovery = http.get('recovery') or {}
    validate_release_recovery(recovery)
    if any(record.get('earlierAttempts') for record in regressions['tests'].values()) and not args.verification_resume:
        raise ValueError('Release regressions contain replaced attempts; supply --verification-resume to preserve their command history')
    resume = load(args.verification_resume) if args.verification_resume else None
    original_workflow, before_resume = validate_verification_resume(workflow, regressions, args.regressions, resume) if args.verification_resume else (None, None)
    stages = http['scenarios']
    games = [stage for stage in stages if stage.get('kind') != 'login']
    passes = [stage for stage in games if qualified(stage, http)]
    content = '<header><p class="eyebrow">MUZIKAZ · COMBINED MAIN SOURCE</p><h1>Release verification and sampled gameplay</h1>'
    content += '<p class="lead"><strong>' + str(len(passes)) + ' of ' + str(len(games)) + ' attempted HTTP gameplay workloads met every applicable gate.</strong></p>'
    content += '<p>Tested source: <code>' + esc(workflow['sourceCommit']) + '</code>; HTTP window: ' + esc(stamp(http.get('startedAt'))) + ' to ' + esc(stamp(http.get('finishedAt'))) + '.</p></header>'
    content += '<div class="notice"><strong>Scope: the listed HTTP workloads only.</strong> This is an HTTP-only follow-up, not a new full-capacity matrix. '
    content += 'Untested room sizes and environments, plus 1,000/10,000-player simulation or admission targets, remain unqualified on this source. '
    content += 'Passing short local samples do not establish a sustained public-launch capacity.</div>'
    checks_clean = regressions['summary'].get('passed') == regressions['requestedFiles'] and all(item['exitCode'] == 0 for item in static['commands']) and all(item['status'] == 'passed' for item in browser['checks']) and (not selected_browser or len(browser['checks']) == len(browser['selectedChecks'])) and recovery.get('pass') is True and (not resume or resume['command']['status'] == 'passed')
    if not checks_clean:
        content += '<div class="notice"><strong>Some correctness, build, browser or recovery checks failed or did not complete.</strong> '
        content += 'The recorded outcomes below remain separate from HTTP workload passes.</div>'
    if args.historical_report:
        if ':' in args.historical_report.split('/')[0] and not args.historical_report.startswith(('https://', 'http://')):
            raise ValueError('Historical report link must be a relative path or HTTP(S) URL')
        content += '<p><a href="' + esc(args.historical_report) + '">Earlier full-matrix report on its separately identified source</a>. '
        content += 'Its outcomes are historical evidence and are not merged into the current workload or regression counts.</p>'
    content += '<section><h2>HTTP latency, delivery and frame freshness</h2>' + plot_http(stages, http, {}) + http_table(stages, http)
    content += '<p>Gates retain p95 ≤100 ms, p99 ≤250 ms, at least 95% delivery of all offered 20 Hz slots by deadline, '
    content += 'at least 99% successful completed requests, valid hydrated snapshots, maintained expected presence and applicable health, capacity and ledger checks. '
    content += 'General-world wire frame-age p95 must be ≤100 ms; native hockey and arcade do not expose that clock pair and no freshness pass is inferred. '
    content += 'Hydration is already included in request timing. Skipped slots stay in the denominator.</p>'
    content += '<p>Stored synthetic accounts: ' + esc(http.get('syntheticAccounts', 'unavailable')) + '; offered movement per workload: '
    content += num(http.get('durationMs', 0) / 1000, 0) + ' seconds. Fresh temporary datasets and server processes are used for stages. '
    content += 'These loopback experiments do not measure WAN or browser/GPU/VR rendering, live payment settlement or multi-host failover.</p></section>'
    content += '<section><h2>Checkpointed restart and complete wallet receipts</h2>'
    content += '<p>The corrected recovery boundary captures acknowledged balance, inventory and complete wallet receipts immediately before hard shutdown, '
    content += 'after movement and the persisted room checkpoint. Earlier movement credits are retained as diagnostics. '
    content += 'These samples do not qualify arbitrary in-flight crashes or power-loss durability.</p>'
    checks = [('pass', 'Overall checkpointed restart'), ('sessionSurvived', 'Session survived'), ('balancePreserved', 'Exact pre-kill balance preserved'),
              ('walletReceiptsPreserved', 'Complete wallet receipts preserved'), ('movementBalanceReconciles', 'Signed movement ledger reconciles'),
              ('inventoryPreserved', 'Inventory preserved'), ('publishedMapPreserved', 'Published map preserved'), ('checkpointPreserved', 'Saved position preserved')]
    content += table(['Check', 'Recorded result'], [[label, recovery.get(key, 'not completed') if recovery.get('status') == 'completed' else 'not completed'] for key, label in checks])
    content += table(['Balance boundary', 'MZK'], [[label, recovery.get(key, 'not recorded')] for key, label in
                     [('preMovementBalanceMzk', 'Before movement: diagnostic'), ('beforeKillBalanceMzk', 'Immediately before hard kill'), ('afterRestartBalanceMzk', 'After restart')]])
    content += table(['Receipt boundary', 'Recorded count', 'Recorded receipt SHA-256'], [
        [label, (recovery.get(key) or {}).get('receiptCount', 'not recorded'), (recovery.get(key) or {}).get('receiptSHA256', 'not recorded')]
        for key, label in [('preKillLedger', 'Immediately before hard kill'), ('postRestartLedger', 'After restart')]])
    content += '<p>Observed restart time: ' + num(recovery.get('restartMs')) + ' ms. All original wallet records and individual preservation checks are embedded below.</p></section>'
    if resume:
        initial, repeated = resume['initialNodeCommand'], resume['command']
        retained = regressions['requestedFiles'] - len(resume['executedFiles'])
        content += '<section><h2>Original verification and fixture-only resume</h2>'
        content += '<p>The original complete Node command retains its recorded outcome below. After test-fixture corrections, the same application, '
        content += 'runner, guard and declared commands were resumed. Only ' + str(len(resume['executedFiles'])) + ' changed test files executed again; '
        content += str(retained) + ' unchanged file proofs were retained. The final counts below cover each declared file once; earlier cases are not added again.</p>'
        content += table(['Attempt', 'Executed files', 'Recorded outcome', 'Exit code', 'Window'], [
            ['Original full Node command', before_resume['requestedFiles'], initial['status'], initial['exitCode'], stamp(initial.get('startedAt')) + ' to ' + stamp(initial.get('finishedAt'))],
            ['Fixture-only checkpoint resume', len(resume['executedFiles']), repeated['status'], repeated['exitCode'], stamp(repeated.get('startedAt')) + ' to ' + stamp(repeated.get('finishedAt'))]])
        content += table(['Pre-resume checkpoint case outcome', 'Cases'], [[key, value] for key, value in before_resume['testCaseTotals'].items()])
        content += table(['Changed fixture', 'Earlier outcome', 'Earlier test SHA-256', 'Executed replacement SHA-256', 'Final outcome'], [
            [item['name'], item['previousStatus'], item['previousSHA256'], item['currentSHA256'], regressions['tests'][item['name']]['status']]
            for item in resume['rerunFiles']])
        content += '<p>The original workflow, pre-resume checkpoint, resume command and final checkpoint match their recorded artifact hashes. '
        content += 'Each replaced result retains its earlier failed attempt and log identity.</p></section>'
    source = regressions['source']
    selected_node = regressions.get('executionScope') == 'selected'
    content += '<section><h2>' + ('Selected affected Node checks' if selected_node else 'Full declared Node regression campaign') + '</h2>'
    if selected_node:
        content += '<p><strong>Coverage is partial: ' + str(regressions['requestedFiles']) + ' selected files out of ' + str(regressions['availableTestFiles']) + ' available files; complete=false.</strong> '
        content += 'Earlier full-suite results retain their historical source identities and are not substituted for unexecuted current-source tests.</p>'
    content += table(['File outcome', 'Files'], [[key, value] for key, value in regressions['summary'].items()])
    content += table(['Node test-case outcome', 'Cases'], [[key, value] for key, value in regressions['testCaseTotals'].items()])
    content += '<p>Declared files: ' + str(regressions['requestedFiles']) + '; complete TAP summaries: ' + str(regressions['filesWithCompleteTestCaseSummary']) + '. '
    content += 'Counts are test cases, not individual assertion calls. Skips and failed or incomplete files remain visible. '
    content += 'Correctness regressions do not increase the measured player capacity.</p>'
    budgets = [['Default', source.get('testTimeoutMs', 0) / 1000, source.get('outerTimeoutSeconds'), 'Other files']]
    budgets += [[name, value.get('testTimeoutMs', 0) / 1000, value.get('outerTimeoutSeconds'), value.get('reason', '')]
                for name, value in source.get('timeoutOverrides', {}).items() if not selected_node or name in regressions['tests']]
    content += table(['File scope', 'Node deadline s', 'Outer deadline s', 'Declared purpose'], budgets)
    content += '<p>The command list, execution order, critical-phase barrier, budgets, Node version, runner and network guard are '
    content += 'recorded in the broader source fingerprint: <code>' + esc(source['fingerprint']) + '</code>. '
    content += 'Individual test hashes are retained separately in their per-file result records. '
    content += 'Every HTTP runtime and harness hash matches that broader manifest. Runtime source stayed unchanged.</p>'
    if selected_node:
        content += table(['Capture', 'Recorded commit', 'Source fingerprint'], [[label, item.get('sourceCommit', 'not recorded'), item['source']['fingerprint']] for label, item in [('Node selection', {'sourceCommit': source.get('sourceCommit'), 'source': source}), ('Static checks', static), ('Browser checks', {'sourceCommit': browser['source'].get('sourceCommit'), 'source': browser['source']})]])
        content += '<p>Commit labels may differ across the commit boundary; application, asset and helper hashes, Node, guard, runner and selected command declarations match exactly.</p>'
    notable = [[name, item['status'], item.get('testCases', {}).get('footer'), num(item.get('elapsedSeconds'))]
               for name, item in regressions['tests'].items() if item['status'] != 'passed' or (item.get('testCases', {}).get('footer') or {}).get('skipped')]
    if notable:
        content += table(['Skipped or non-passing file', 'Status', 'TAP summary', 'Elapsed s'], notable)
    content += '</section><section><h2>Build, static and isolated browser checks</h2>'
    content += table(['Command', 'Exit code', 'Elapsed s'], [[shlex.join(item['argv']), item['exitCode'], num(item.get('elapsedSeconds'))] for item in static['commands']])
    browser_rows = [[item['name'], item['status'], item.get('exitCode'), num(item.get('elapsedSeconds'))] for item in browser['checks']]
    if selected_browser:
        browser_rows += [[name, 'not run', '—', '—'] for name in browser['selectedChecks'] if name not in {item['name'] for item in browser['checks']}]
    content += table(['Selected browser check', 'Result', 'Exit code', 'Elapsed s'], browser_rows)
    content += '<p>These completed checks match the Node runtime, guard, runner and application source. '
    content += str(len(browser['checks'])) + ' selected browser checks provide functional coverage. They do not cover the full browser suite or establish live-client capacity. Every browser fixture hash was verified unchanged during its check.</p>'
    if selected_browser:
        omitted = sorted(expected_browser - set(browser['selectedChecks']))
        content += '<p>Browser coverage is partial (complete=false). Current-source results are limited to the checks listed above. '
        content += 'The remaining designated checks have no new result here: ' + esc(', '.join(omitted) or 'none') + '.</p>'
    if fixture_changes:
        content += '<p>Only the following declared existing browser fixtures changed between the Node and browser campaigns; application and helper files match.</p>'
        content += table(['Browser fixture', 'Node-time SHA-256', 'Browser-time SHA-256'], fixture_changes)
    content += '</section><section><h2>Source-bound commands and raw evidence</h2><p>HTTP runtime SHA-256: <code>' + esc(workflow['runtimeSourceSHA256']) + '</code>.</p>'
    content += '<pre>' + esc('\n'.join(shlex.join(item['argv']) for item in workflow['commands'])) + '</pre>'
    payload = {'http': http, 'http-workflow': workflow, 'node-regressions': regressions, 'static-checks': static, 'selected-browser-checks': browser}
    if resume:
        payload.update({'verification-resume': resume, 'original-verification-workflow': original_workflow, 'node-checkpoint-before-fixture-resume': before_resume})
        helper = verified_helper_source(args.verification_resume.resolve().parent / 'run-verification-resume.py', resume.get('driverSHA256'), 'verification resume driver')
        if helper:
            payload['verification-resume-driver'] = helper
    helper_directory = args.regressions.resolve().parent.parent
    for label, name, digest in [('node-runner', 'run-affected-checks.py' if selected_node else 'run-regressions.py', source.get('runnerSHA256')),
                                ('underlying-node-runner', 'run-regressions.py', source.get('originalRunnerSHA256') if selected_node else None),
                                ('network-guard', 'regression-guard.mjs', source.get('guardSHA256')),
                                ('browser-runner', 'run-affected-browser-checks.py' if selected_browser else 'run-browser-regressions.py', browser['source'].get('browserRunnerSHA256'))]:
        helper = verified_helper_source(helper_directory / name, digest, label)
        if helper:
            payload[label] = helper
    for label, value in payload.items():
        content += evidence('Embedded evidence · ' + label, value)
    content += '</section>'
    css = 'body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#edf2f6;color:#243447}main{max-width:1280px;margin:28px auto;padding:36px;background:white;border-radius:12px}h1,h2{color:#142d43;line-height:1.25}h1{font-size:36px}.eyebrow{font-weight:700;letter-spacing:.08em;font-size:12px}.lead{font-size:21px}.notice{background:#edf5fb;border-left:4px solid #37789f;padding:16px}section{margin-top:34px}.scroll{overflow:auto;border:1px solid #dbe4ec;border-radius:7px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid #dbe4ec}th{background:#edf2f7}tr:nth-child(even){background:#f8fafc}code,pre{overflow-wrap:anywhere;font-size:12px}pre{white-space:pre-wrap;padding:14px;background:#f0f4f8}details{margin:12px 0;border:1px solid #dbe4ec;border-radius:6px}summary{padding:12px;font-weight:650;cursor:pointer}svg{max-width:100%;height:auto}a{color:#145f8f}@media(max-width:700px){main{margin:0;padding:20px 14px}h1{font-size:29px}}'
    output = args.output or directory / 'report.html'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MUZIKAZ main release verification</title><style>' + css + '</style></head><body><main>' + content + '</main></body></html>')
    print(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--release-summary', action='store_true',
                        help='HTTP-only release summary bound to source-verified declared Node, static and browser checks; selected coverage stays explicit')
    parser.add_argument('--historical-report', help='Separate historical full-matrix report link for release-summary mode')
    parser.add_argument('--verification-resume', type=Path,
                        help='Completed source-bound fixture-only checkpoint resume for release-summary mode')
    parser.add_argument('--supplement', '--supplement-http', dest='supplement_http', type=Path,
                        help='Separate completed HTTP file/directory; requires adjacent completed workflow.json')
    parser.add_argument('--regressions', type=Path, help='Completed regression results.json, reported separately from capacity qualification')
    parser.add_argument('--extended-regression', type=Path,
                        help='Completed separate long-budget test attempt, source/test-bound to --regressions')
    parser.add_argument('--static-checks', type=Path, help='Completed source-bound build, syntax and asset checks')
    parser.add_argument('--browser-regressions', type=Path, help='Completed source-bound selected browser checks')
    parser.add_argument('--recovery-diagnostic', type=Path,
                        help='Separate instrumented recovery result; requires adjacent <stem>-provenance.json')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.release_summary:
        if args.supplement_http or args.extended_regression or args.recovery_diagnostic or args.baseline:
            parser.error('Release-summary mode does not merge historical experiment families or diagnostics')
        try:
            render_release_summary(args)
        except ValueError as error:
            parser.error(str(error))
        return
    if args.verification_resume:
        parser.error('--verification-resume requires --release-summary')
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
    supplement_path = args.supplement_http
    if supplement_path and supplement_path.is_dir():
        supplement_path = supplement_path / 'http.json'
    supplement = load(supplement_path) if supplement_path else None
    supplement_workflow = load(supplement_path.parent / 'workflow.json') if supplement_path else None
    regressions = load(args.regressions) if args.regressions else None
    extended_regression = load(args.extended_regression) if args.extended_regression else None
    static_checks = load(args.static_checks) if args.static_checks else None
    browser_regressions = load(args.browser_regressions) if args.browser_regressions else None
    recovery_diagnostic = load(args.recovery_diagnostic) if args.recovery_diagnostic else None
    recovery_provenance_path = args.recovery_diagnostic.with_name(args.recovery_diagnostic.stem + '-provenance.json') if args.recovery_diagnostic else None
    recovery_provenance = load(recovery_provenance_path) if recovery_provenance_path else None
    recovery_diagnostic_script = None
    for label, path, report in [('supplemental HTTP', supplement_path, supplement), ('regressions', args.regressions, regressions)]:
        if path and (report is None or not report.get('finishedAt')):
            parser.error('The ' + label + ' input must exist and be complete: ' + str(path))
    if regressions and regressions.get('runtimeChangedDuringRun') is not False:
        parser.error('Regression source changed during the run; evidence cannot qualify a final build')
    try:
        validate_primary_evidence(current, regressions)
        if supplement_path:
            validate_supplement_evidence(supplement, supplement_workflow)
        if args.recovery_diagnostic:
            recovery_diagnostic_script = validate_recovery_diagnostic(current, recovery_diagnostic, recovery_provenance, args.recovery_diagnostic)
    except ValueError as error:
        parser.error(str(error))
    extended_test = None
    if args.extended_regression:
        try:
            extended_test = validate_extended_regression(regressions, extended_regression)
        except ValueError as error:
            parser.error(str(error))
    for path, report, validator in [(args.static_checks, static_checks, validate_static_checks),
                                    (args.browser_regressions, browser_regressions, validate_browser_regressions)]:
        if path:
            try:
                validator(regressions, report)
            except ValueError as error:
                parser.error(str(error))
    helper_sources = {}
    if regressions:
        helper_directory = args.regressions.resolve().parent.parent
        candidates = [('node-regression-runner', helper_directory / 'run-regressions.py', regressions['source'].get('runnerSHA256')),
                      ('loopback-network-guard', helper_directory / 'regression-guard.mjs', regressions['source'].get('guardSHA256'))]
        if browser_regressions:
            candidates.append(('browser-regression-runner', helper_directory / 'run-browser-regressions.py',
                               browser_regressions.get('source', {}).get('browserRunnerSHA256')))
        for label, path, digest in candidates:
            try:
                source = verified_helper_source(path, digest, label)
            except ValueError as error:
                parser.error(str(error))
            if source is not None:
                helper_sources[label] = source
    baseline = {key: load(args.baseline / (key + '.json')) for key in ('http', 'simulation', 'storage', 'admission')} if args.baseline else {}
    before = baseline.get('http') or {}
    stages = http.get('scenarios', [])
    gameplay = [stage for stage in stages if stage.get('kind') != 'login']
    passes = [stage for stage in gameplay if qualified(stage, http)]
    latest = supplement or http
    latest_gameplay = [stage for stage in latest.get('scenarios', []) if stage.get('kind') != 'login']
    latest_passes = [stage for stage in latest_gameplay if qualified(stage, latest)]
    latest_unqualified = [stage for stage in latest_gameplay if not qualified(stage, latest)]
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
    content += str(len(latest_passes)) + ' of ' + str(len(latest_gameplay)) + ' attempted HTTP gameplay workloads on the latest tested build met every applicable gate.</strong> '
    content += 'A passing short workload qualifies that sample; it does not certify a sustained public launch or establish an overall player limit.</p>'
    content += '<p>Latest tested source: <code>' + esc(latest.get('sourceCommit', 'unavailable')) + '</code>; experiment window: '
    content += esc(stamp(latest.get('startedAt'))) + ' to ' + esc(stamp(latest.get('finishedAt'))) + '.</p>'
    if supplement:
        content += '<p>The earlier full matrix on <code>' + esc(http.get('sourceCommit', 'unavailable')) + '</code> recorded '
        content += str(len(passes)) + '/' + str(len(gameplay)) + ' gameplay passes. Those older passes do not qualify workloads that missed a gate in the latest run.</p>'
    if before:
        content += '<p>Baseline: ' + str(len(old_passes)) + '/' + str(len(old_gameplay)) + ' gameplay workloads met all gates. '
        content += 'The implementation results measure changed server code with the same offered cadence, populations and time windows, '
        content += 'plus browser-equivalent snapshot hydration and an added general-world freshness gate.</p>'
    content += '<p>Full-matrix experiment window: ' + esc(stamp(workflow.get('startedAt'))) + ' to ' + esc(stamp(workflow.get('finishedAt'))) + '.</p></header>'
    content += '<div class="notice"><strong>Three different measurements:</strong> connected clients making real HTTP gameplay requests; '
    content += 'synthetic populations running simulation only; and cold-login attempts. Their player and request counts are not interchangeable.</div>'
    if interruptions:
        content += '<div class="notice"><strong>External execution interruption recorded.</strong> Completed results were retained and remaining '
        content += 'work was resumed as documented in the workflow. This is separate from deliberate per-stage experiment cutoffs. '
        content += 'An interrupted experiment alone does not establish a spontaneous game-server crash.</div>'

    content += '<section><h2>Latest sampled passes and remaining work</h2><p>Latest HTTP samples meeting every applicable gate: '
    content += esc(', '.join(name(stage) for stage in latest_passes) or 'none') + '.</p>'
    content += '<p>Latest workloads not meeting every gate: ' + esc(', '.join(name(stage) for stage in latest_unqualified) or 'none') + '.</p>'
    if (latest.get('recovery') or {}).get('pass') is False:
        failed_recovery = [label for key, label in [('sessionSurvived', 'session'), ('balancePreserved', 'balance'),
                           ('inventoryPreserved', 'inventory'), ('publishedMapPreserved', 'published map'),
                           ('checkpointPreserved', 'checkpointed position')] if latest['recovery'].get(key) is False]
        content += '<div class="notice"><strong>The checkpointed restart check failed.</strong> Recorded failed checks: '
        content += esc(', '.join(failed_recovery) or 'see embedded recovery evidence') + '. The original result is retained below; '
        content += 'the HTTP workload pass count does not imply a recovery pass.</div>'
    if supplement:
        older_pass_names = {stage.get('name') for stage in passes}
        inconsistent = [stage for stage in latest_unqualified if stage.get('name') in older_pass_names]
        if inconsistent:
            content += '<div class="notice"><strong>Short-run results are inconsistent for '
            content += esc(', '.join(name(stage) for stage in inconsistent)) + '.</strong> These workloads passed an earlier short sample but '
            content += 'missed at least one gate in the latest release run. They remain open; the older passing samples are not a current capacity qualification. '
            content += 'The runs use different source revisions and activity samples, so they do not isolate the cause of this variation.</div>'
        content += '<p>The larger-target evidence below comes from the earlier full matrix. Those workloads were not repeated in the latest subset '
        content += 'and remain unqualified on the latest build.</p>'
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

    matrix_label = 'Earlier full-matrix' if supplement else 'Current full-matrix'
    content += '<section><h2>Test conditions and source identities</h2><p>The ' + matrix_label.lower() + ' implementation includes changes to authentication, '
    content += 'identity refresh, persistence, world-resource caches, scheduled movement, snapshot encoding and collision queries. The recorded source commit is <code>' + esc(http.get('sourceCommit', workflow.get('sourceCommit', 'unavailable'))) + '</code>. '
    content += 'The workflow’s source manifest and hashes identify the exact tested runtime and verify that it stayed unchanged during every family. '
    content += 'Each family’s runtime hash is checked against that manifest before this report is rendered. '
    if supplement:
        content += 'Later supplements retain their own source identity and do not replace these matrix results. '
    if regressions:
        content += 'The broader correctness manifest contains identical runtime and pressure-harness file hashes. '
    content += '</p>'
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
    content += '<p>For general authoritative worlds, raw wire <code>serverTime − simulationTime</code> must have p95 ≤100 ms. '
    content += 'This age is measured before client hydration so a reused component cannot hide an old simulation frame. '
    content += 'Native hockey and arcade APIs do not expose the same clock pair: their frame age is not measured and no freshness pass is inferred. '
    content += 'A fresh response among a small subset of delivered inputs cannot compensate for missed input slots.</p>'
    content += '<p>Protocol 2 matches the current browser client: the load generator reconstructs acknowledged components and validates the resulting '
    content += 'snapshot. Request timing and deadline delivery include this client hydration cost. Hydration p95 is shown separately as a diagnostic '
    content += 'and must not be added to the request timing a second time.</p>'
    if 'negotiated exact decor-actor reuse' in http.get('methodology', {}).get('snapshotProtocol', ''):
        content += '<p>Updated clients explicitly request complete scenery-actor component reuse. Exact record or membership changes invalidate the revision; '
        content += 'hydration restores all actors and fields. Residents, traffic and other unclassified actors remain inline. The optional scenery component is '
        content += 'admitted only when it and the base components fit together within the world and global cache limits; otherwise scenery stays inline and '
        content += 'base acknowledgments remain usable. Older protocol 2 clients receive their existing format.</p>'
        content += '<p>Collision queries select indexed nearby meshes before extracting transformed wall triangles, preserving candidate order and live poses. '
        content += 'Per-mesh triangle reuse checks geometry, attribute/index/instance identity and versions, instance count, ownership and the world matrix. '
        content += 'Geometry mutations must follow the renderer’s attribute-version contract. These implementation details do not replace the measured '
        content += 'workload gates, and no NPC or physics feature was removed to obtain the results.</p>'
    content += '<p>One input may be in flight per player. Skipped slots remain in the denominator, and request timings include errors and timeouts. '
    content += 'Loopback clients and the server share a machine. Browser/GPU/VR rendering, WAN behavior, vehicle driving, live payment settlement, '
    content += 'power-loss durability and multi-host failover require separate qualification.</p></section>'

    content += '<section><h2>' + matrix_label + ' HTTP latency and update delivery</h2>' + plot_http(stages, http, before)
    content += '<p class="caption">This chart and table describe the ' + matrix_label.lower() + ' source. '
    content += 'Bars show the changed implementation; dark diamonds show matched complete baseline stages with verified presence. '
    content += 'Green latency bars identify full gate passes. † Presence was not maintained or could not be verified. '
    content += 'Experiment-cutoff stages are omitted from the chart and retained in the table.</p>'
    content += http_table(stages, http)
    content += '<p class="caption">† Timings from experiment-limited stages can include requests after termination; they do not qualify '
    content += 'steady gameplay. Failed occupancy replies mean unavailable, not zero players. Cutoffs are imposed experiment terminations.</p></section>'

    if before:
        content += '<section><h2>' + matrix_label + ' change from the baseline</h2><p>Only matching scene sizes, populations, durations, stored-account counts '
        content += 'and input cadence are paired. Both stages must be complete, free of experiment cutoffs and verified for expected presence. '
        content += 'Synthetic identities and random activity may differ. Short runs describe observed results; they do not establish statistical '
        content += 'significance or sustained production capacity. The older harness measured HTTP plus JSON parsing with the earlier snapshot '
        content += 'path; the current path includes component hydration and checks frame freshness. These results compare the delivered implementations '
        content += 'under matched offered workloads; they do not isolate any one optimization or constitute an identical-protocol microbenchmark.</p>'
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

    if supplement:
        supplemental_stages = supplement.get('scenarios', [])
        supplemental_games = [stage for stage in supplemental_stages if stage.get('kind') != 'login']
        supplemental_passes = [stage for stage in supplemental_games if qualified(stage, supplement)]
        content += '<section><h2>Latest release HTTP verification</h2><p>This is a separate run with '
        content += str(len(supplemental_passes)) + '/' + str(len(supplemental_games)) + ' attempted gameplay workloads meeting every applicable gate. '
        content += 'It is not merged with the full matrix above, and untested workloads on this later source remain unqualified.</p>'
        content += '<p>Recorded source commit: <code>' + esc(supplement.get('sourceCommit', 'unavailable')) + '</code>; runtime fingerprint: <code>'
        content += esc(supplement.get('runtimeSourceSHA256', 'not recorded')) + '</code>. Window: '
        content += esc(stamp(supplement.get('startedAt'))) + ' to ' + esc(stamp(supplement.get('finishedAt'))) + '.</p>'
        content += '<p>Source unchanged during run: ' + esc(supplement.get('runtimeSourceUnchangedDuringRun', 'not recorded')) + '.</p>'
        if supplement_workflow:
            content += '<p>The supplemental workflow is embedded below with its independent commands and source manifest.</p>'
        content += http_table(supplemental_stages, supplement)
        content += '<p>A low p95 response time does not compensate for missed offered updates. The scheduling diagnostics below retain skipped '
        content += 'slots and deadline delivery separately from successful requests. Event-loop observations describe the measured run; '
        content += 'they do not establish whether source changes, random activity or machine scheduling caused a difference between runs.</p>'
        content += table(['Latest workload', 'Offered slots', 'Skipped slots', 'Successful by deadline', 'Successful requests including drain',
                          'Generator event-loop max ms', 'Server interval-max p95 ms'], [
            [name(stage), stage.get('offeredSlots', '—'), stage.get('skippedSlots', '—'), stage.get('successfulByDeadline', '—'),
             stage.get('successfulRequests', '—'), num(stage.get('generator', {}).get('eventLoopMaxMs')),
             num(stage.get('server', {}).get('eventLoopMaxMs', {}).get('p95'))]
            for stage in supplemental_games])
        supplemental_recovery = supplement.get('recovery') or {}
        if supplemental_recovery:
            content += '<p>Follow-up checkpointed restart: ' + esc('passed' if supplemental_recovery.get('pass') else 'failed')
            content += '; observed restart ' + num(supplemental_recovery.get('restartMs')) + ' ms. '
            content += 'This checks the selected persisted session, balance, inventory, map and position after a hard kill; it does not qualify an arbitrary in-flight crash.</p>'
        supplemental_ledgers = []
        for stage in supplemental_stages:
            side = stage.get('sideTraffic') or {}
            ledger = side.get('ledgerAssessment') or {}
            if side.get('requests', 0):
                supplemental_ledgers.append([name(stage), ledger.get('status', 'not completed'), side.get('acknowledgedSpends', '—'),
                                            ledger.get('creditsMzk', '—'), ledger.get('debitsMzk', '—'),
                                            side.get('balanceBefore', '—'), side.get('balanceAfter', '—')])
        if supplemental_ledgers:
            content += table(['Follow-up workload', 'Ledger assessment', 'Acknowledged spends', 'Credits MZK', 'Debits MZK', 'Starting balance', 'Ending balance'], supplemental_ledgers)
        content += '</section>'

    if static_checks:
        content += '<section><h2>Build and static verification</h2><p>These completed commands use the same runtime, Node version, guard, '
        content += 'runner and source fingerprint as the regression run. Runtime source stayed unchanged. Their exit codes establish the listed '
        content += 'build and consistency outcomes; they do not measure gameplay smoothness.</p>'
        content += table(['Command', 'Exit code', 'Result', 'Elapsed s'], [
            [shlex.join(command['argv']), command['exitCode'], 'passed' if command['exitCode'] == 0 else 'failed', num(command.get('elapsedSeconds'))]
            for command in static_checks['commands']])
        if static_checks.get('methodology'):
            content += '<p>' + esc(static_checks['methodology']) + '</p>'
        content += '</section>'

    if browser_regressions:
        checks = browser_regressions['checks']
        fixture_differences = validate_browser_regressions(regressions, browser_regressions)
        passed_checks = sum(check['status'] == 'passed' for check in checks)
        content += '<section><h2>Selected browser verification</h2><p>' + str(passed_checks) + '/' + str(len(checks))
        content += ' selected existing browser checks passed. These selected checks do not cover the full browser suite and do not establish '
        content += 'live-client capacity. Node, guard, runner, application and helper files match the Node regression evidence. '
        content += 'Every selected test hash matches the browser source manifest and was verified unchanged during the browser run.</p>'
        if fixture_differences:
            content += '<p>The broad source fingerprint differs from the Node run solely because the following independent browser fixtures '
            content += 'changed between runs. Both old and new hashes are retained. These exceptions do not permit application or helper changes '
            content += 'and do not rewrite the Node outcomes.</p>'
            content += table(['Standalone browser fixture', 'Hash during Node run', 'Hash during final browser run'], fixture_differences)
        else:
            content += '<p>The broad source fingerprint also matches the Node regression run exactly.</p>'
        content += '<p>Browser-run source fingerprint: <code>' + esc(browser_regressions['source']['fingerprint']) + '</code>.</p>'
        content += table(['Selected check', 'Result', 'Exit code', 'Elapsed s', 'Blocked network events'], [
            [check['name'], check['status'], check.get('exitCode', '—'), num(check.get('elapsedSeconds')), check.get('blockedNetworkEvents', '—')]
            for check in checks])
        content += '<p>' + esc(browser_regressions.get('methodology', '')) + '</p>'
        content += '<p>Browser: ' + esc(browser_regressions.get('source', {}).get('chromium', 'unavailable'))
        content += '; Playwright ' + esc(browser_regressions.get('source', {}).get('playwright', 'unavailable')) + '.</p></section>'

    if regressions:
        content += '<section><h2>Regression verification of the final source</h2><p>These functional checks are separate from timing experiments. '
        content += 'A passing regression does not increase the measured player capacity.</p>'
        content += table(['Per-file campaign result', 'Files'], [[key, value] for key, value in regressions.get('summary', {}).items()])
        content += table(['Campaign Node test-case result', 'Cases'], [[key, value] for key, value in regressions.get('testCaseTotals', {}).items()])
        content += '<p>Requested files: ' + esc(regressions.get('requestedFiles', 'unavailable')) + '; files with complete TAP summaries: '
        content += esc(regressions.get('filesWithCompleteTestCaseSummary', 'unavailable')) + '. These are Node test cases, not individual assertion calls. '
        content += 'Source unchanged during run: ' + esc(not regressions.get('runtimeChangedDuringRun', True)) + '. Source fingerprint: <code>'
        content += esc(regressions.get('source', {}).get('fingerprint', 'unavailable')) + '</code>. '
        content += 'The regression fingerprint covers a broader file set and the runner/guard, so it differs from the capacity runtime fingerprint.</p>'
        content += '<p>' + esc(regressions.get('methodology', '')) + '</p>'
        regression_source = regressions.get('source') or {}
        if regression_source.get('timeoutOverrides'):
            budgets = [['Default per-file allowance', num(regression_source.get('testTimeoutMs', 0) / 1000, 0),
                        regression_source.get('outerTimeoutSeconds', '—'), 'All files without a declared override']]
            for test_name, budget in regression_source['timeoutOverrides'].items():
                budgets.append([test_name, num(budget.get('testTimeoutMs', 0) / 1000, 0),
                                budget.get('outerTimeoutSeconds', '—'), budget.get('reason', '')])
            content += '<p>These per-file deadlines were declared in the fingerprinted runner before the campaign. They are test-runner '
            content += 'allowances, separate from the HTTP and simulation performance gates. Each recorded command and deadline matches '
            content += 'its declaration; exact arguments are embedded below.</p>'
            content += table(['Test scope', 'Node deadline s', 'Outer deadline s', 'Reason'], budgets)
        if extended_regression:
            test_name, standard_attempt = extended_test
            extended_footer = extended_regression.get('testCases', {}).get('footer') or {}
            content += '<h3>Separate extended-budget matrix attempt</h3><p>The standard attempt is retained above with its original outcome. '
            content += 'The same test was run again with a larger test-runner budget; no game-performance limit was relaxed. '
            content += 'Runtime, Node version, guard, runner and test hashes match the standard evidence, and source stayed unchanged.</p>'
            content += table(['Test', 'Attempt', 'Node test budget s', 'Outer deadline s', 'Result', 'Elapsed s'], [
                [test_name, 'standard', num(regressions.get('source', {}).get('testTimeoutMs', 0) / 1000, 0),
                 regressions.get('source', {}).get('outerTimeoutSeconds', '—'), standard_attempt.get('status', 'unavailable'),
                 num(standard_attempt.get('elapsedSeconds'))],
                [test_name, 'separate extended attempt', num(extended_regression.get('testTimeoutMs', 0) / 1000, 0),
                 extended_regression.get('outerTimeoutSeconds', '—'), extended_regression.get('status', 'unavailable'),
                 num(extended_regression.get('elapsedSeconds'))]])
            content += table(['Extended-attempt Node test-case result', 'Cases'], [[key, value] for key, value in extended_footer.items()])
            content += '<p>Standard and extended TAP totals are shown separately. Repeated or incomplete cases from the first attempt are not '
            content += 'added to the extended attempt to create a combined case count. Test SHA-256: <code>' + esc(extended_regression.get('testSHA256')) + '</code>.</p>'
        content += '</section>'

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

    if recovery_diagnostic:
        attempts = recovery_diagnostic['recoveryAttempts']
        exact_count = sum(attempt['diagnostic'].get('exactBalancePreservedAtKill') is True and attempt['diagnostic'].get('allWalletReceiptsPreserved') is True for attempt in attempts)
        explained_count = sum(attempt['diagnostic'].get('coinCreditExplainsDifference') is True for attempt in attempts)
        content += '<section><h2>Separate instrumented recovery diagnostic</h2><p>The primary campaign’s failed recovery result above remains unchanged. '
        content += 'It recorded neither the compared balance values nor the corresponding ledger, so its specific discrepancy remains inconclusive. '
        content += 'This later diagnostic skips gameplay pressure stages and does not change the HTTP workload qualification count.</p>'
        content += '<p>The follow-up recorded balance immediately before each hard kill and after restart, alongside wallet receipts. '
        content += str(exact_count) + '/' + str(len(attempts)) + ' separate attempts preserved that exact prekill balance and every captured wallet receipt. '
        if explained_count:
            content += 'In ' + str(explained_count) + ' attempt(s), movement legitimately earned a signed coin credit between the old pre-movement baseline and the kill. '
            content += 'Comparing that older baseline with the restored balance therefore reported a failure despite preservation of the exact prekill balance. '
            content += 'This reproduces a measurement false failure; it does not establish the cause of the original campaign’s discrepancy. '
        content += 'These checkpointed samples do not establish arbitrary in-flight crash or power-loss durability.</p>'
        content += table(['Separate attempt', 'Before movement MZK', 'Immediately before kill MZK', 'After restart MZK',
                          'Signed movement receipts MZK', 'Original equality', 'Exact prekill balance preserved', 'All wallet receipts preserved',
                          'Other selected state preserved', 'Restart ms'], [
            [index, attempt['diagnostic']['preMovementBalance'], attempt['diagnostic']['immediatePreKillBalance'],
             attempt['diagnostic']['afterRestartBalance'], attempt['diagnostic']['netSignedMovementReceipts'],
             attempt['diagnostic']['originalEquality'], attempt['diagnostic'].get('exactBalancePreservedAtKill', 'unavailable'),
             attempt['diagnostic'].get('allWalletReceiptsPreserved', 'unavailable'),
             all(attempt.get(key) is True for key in ('sessionSurvived', 'inventoryPreserved', 'publishedMapPreserved', 'checkpointPreserved')),
             num(attempt.get('restartMs'))]
            for index, attempt in enumerate(attempts, 1)])
        content += '<p>Runtime manifest, source commit, Node version and unchanged canonical pressure-harness hashes match the primary campaign. '
        content += 'The separate diagnostic script and raw result match their recorded SHA-256 digests. '
        content += 'Window: ' + esc(stamp(recovery_diagnostic.get('startedAt'))) + ' to ' + esc(stamp(recovery_diagnostic.get('finishedAt'))) + '.</p>'
        content += '<p>Diagnostic script SHA-256: <code>' + esc(recovery_provenance['diagnosticHarnessSHA256']) + '</code>. '
        content += 'Its top-level diagnostic outcome refers to the investigated measurement behavior, not to the original recovery gate.</p>'
        content += '<pre>' + esc(shlex.join(recovery_provenance['argv'])) + '</pre></section>'

    content += '<section><h2>Reproduce and inspect the evidence</h2><p>The commands below use isolated synthetic state. Retain the source '
    content += 'manifest, fixture sizes, cadence, time windows and resource limits when comparing results. Workflow exit code 1 can indicate '
    content += 'a failed qualification gate; inspect the family results rather than treating every nonzero exit as a server crash.</p>'
    commands = []
    for entry in workflow.get('commands', []):
        argv = entry.get('argv', entry.get('command', []))
        commands.append(shlex.join(argv) if isinstance(argv, list) else str(argv))
    content += '<pre>' + esc('\n'.join(commands)) + '</pre>'
    if helper_sources:
        content += '<p>The portable evidence also embeds the following verification helpers after checking each file against the recorded '
        content += 'SHA-256 digest: ' + esc(', '.join(helper_sources)) + '. Helpers absent from the local evidence directory are omitted; '
        content += 'their recorded hashes remain in the corresponding result metadata.</p>'
    payload = {'changed-' + key: value for key, value in current.items()}
    if supplement:
        payload['follow-up-http'] = supplement
    if supplement_workflow:
        payload['follow-up-workflow'] = supplement_workflow
    if regressions:
        payload['final-regressions'] = regressions
    if extended_regression:
        payload['extended-regression'] = extended_regression
    if static_checks:
        payload['static-checks'] = static_checks
    if browser_regressions:
        payload['selected-browser-regressions'] = browser_regressions
    if recovery_diagnostic:
        payload['separate-recovery-diagnostic'] = recovery_diagnostic
        payload['separate-recovery-diagnostic-provenance'] = recovery_provenance
        payload['separate-recovery-diagnostic-script'] = recovery_diagnostic_script
    for label, source in helper_sources.items():
        payload['verified-helper-' + label] = source
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
