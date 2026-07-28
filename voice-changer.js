(function () {
  'use strict';

  const A = window.Voice3Audio;
  const $ = (selector) => document.querySelector(selector);
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const state = {
    context: null, stream: null, recorder: null, source: null, nodes: [],
    monitor: null, capture: null, chunks: [], rawBlob: null, savedItem: null,
    startedAt: 0, timer: null, objectUrl: null
  };

  function status(message, tone = '') {
    $('#voice-status').textContent = message;
    $('#confirm').textContent = message;
    $('#confirm').dataset.tone = tone;
  }

  function value(id) { return Number($(`#${id}`).value); }
  function settings() {
    return {
      engine: $('#engine').value, pitch: value('pitch'), speed: value('speed'),
      formant: value('formant'), volume: value('volume'), echo: value('echo'),
      reverb: value('reverb'), gate: value('gate'), character: value('character'),
      robot: $('#robot').checked
    };
  }

  function syncReadouts() {
    document.querySelectorAll('[data-value-for]').forEach((output) => {
      const input = $(`#${output.dataset.valueFor}`);
      const suffix = output.dataset.suffix || '';
      output.value = `${Number(input.value).toFixed(input.step < 1 ? 2 : 0)}${suffix}`;
    });
  }

  function stopStream() {
    clearInterval(state.timer);
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    state.nodes.forEach((node) => { try { node.disconnect(); } catch (_) {} });
    state.nodes = [];
    $('#record').classList.remove('is-live');
    $('#live-dot').classList.remove('on');
    $('#record').disabled = false;
    $('#stop-record').disabled = true;
  }

  function createLiveChain(context, stream) {
    const source = context.createMediaStreamSource(stream);
    const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 70;
    const presence = context.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = .8;
    const compressor = context.createDynamicsCompressor(); compressor.ratio.value = 5; compressor.attack.value = .004; compressor.release.value = .16;
    const gain = context.createGain();
    const delay = context.createDelay(.5); delay.delayTime.value = .16;
    const feedback = context.createGain();
    const wet = context.createGain();
    const analyser = context.createAnalyser(); analyser.fftSize = 256;
    const capture = context.createMediaStreamDestination();
    source.connect(highpass).connect(presence).connect(compressor).connect(gain).connect(analyser);
    gain.connect(delay).connect(feedback).connect(delay); delay.connect(wet).connect(analyser);
    analyser.connect(capture);
    if ($('#monitor').checked) analyser.connect(context.destination);
    state.source = source; state.capture = capture; state.monitor = analyser;
    state.nodes = [source, highpass, presence, compressor, gain, delay, feedback, wet, analyser, capture];
    updateLiveChain();
  }

  function updateLiveChain() {
    if (!state.nodes.length) return;
    const [, , presence, compressor, gain, , feedback, wet] = state.nodes;
    const s = settings();
    presence.gain.setTargetAtTime((s.character - .5) * 11, state.context.currentTime, .02);
    compressor.threshold.setTargetAtTime(-18 - s.gate * 32, state.context.currentTime, .02);
    gain.gain.setTargetAtTime(s.volume, state.context.currentTime, .02);
    feedback.gain.setTargetAtTime(Math.min(.72, s.echo), state.context.currentTime, .02);
    wet.gain.setTargetAtTime(Math.max(0, s.echo), state.context.currentTime, .02);
  }

  async function renderWave(blob) {
    const buffer = await A.decode(blob);
    const wave = A.waveform(buffer, 120);
    $('#voice-wave').innerHTML = wave.map((v) => `<i style="height:${12 + v * 70}px"></i>`).join('');
    $('#trim-end').value = buffer.duration.toFixed(3);
    $('#clip-duration').textContent = `${buffer.duration.toFixed(2)} sec`;
    return buffer.duration;
  }

  async function process() {
    if (!state.rawBlob) throw Error('Record a voice clip first.');
    const decodeContext = new AudioCtx();
    const buffer = await decodeContext.decodeAudioData(await state.rawBlob.arrayBuffer());
    await decodeContext.close();
    const s = settings();
    const start = Math.max(0, value('trim-start') || 0);
    const end = Math.min(buffer.duration, value('trim-end') || buffer.duration);
    if (end <= start) throw Error('Trim end must be after trim start.');
    const rate = 44100;
    const length = Math.max(1, Math.floor((end - start) * rate / s.speed));
    const out = new Float32Array(length);
    const input = buffer.getChannelData(0);
    const echoSamples = Math.floor(rate * .16);
    for (let i = 0; i < length; i += 1) {
      const position = start * buffer.sampleRate + i * s.speed * s.pitch * buffer.sampleRate / rate;
      const base = Math.floor(position);
      const fraction = position - base;
      const a = input[Math.min(input.length - 1, base)] || 0;
      const b = input[Math.min(input.length - 1, base + 1)] || 0;
      let sample = (a + (b - a) * fraction) * s.volume;
      const drive = 1 + s.character * 3;
      sample = Math.tanh(sample * drive) / Math.tanh(drive);
      if (s.robot) sample *= Math.sign(Math.sin(i * .085));
      if (s.echo && i > echoSamples) sample += out[i - echoSamples] * s.echo * .65;
      out[i] = Math.max(-1, Math.min(1, sample));
    }
    return A.wavBlob([out], rate);
  }

  async function loadPlayer(blob, message) {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(blob);
    $('#player').src = state.objectUrl;
    await renderWave(blob);
    status(message, 'success');
  }

  async function save(name = 'Voice3 processed voice') {
    const blob = await process();
    const item = await A.itemFromBlob(blob, { displayName: name, sourceType: 'voice-recording', category: 'voice', effectSettings: settings() });
    state.savedItem = item;
    A.dispatch('voice-cropped', { audioId: item.id, engine: settings().engine });
    status(`Saved ${item.displayName} (${item.duration.toFixed(2)}s).`, 'success');
    return item;
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !AudioCtx) throw Error('This browser does not support live audio capture.');
    const deviceId = $('#input-device').value;
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
    state.context = state.context || new AudioCtx({ latencyHint: 'interactive' });
    await state.context.resume();
    createLiveChain(state.context, state.stream);
    state.chunks = [];
    state.recorder = new MediaRecorder(state.capture.stream);
    state.recorder.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
    state.recorder.onstop = async () => {
      state.rawBlob = new Blob(state.chunks, { type: state.recorder.mimeType || 'audio/webm' });
      stopStream();
      await loadPlayer(state.rawBlob, 'Capture ready — audition, trim, or export it.');
      A.dispatch('voice-recorded', { engine: settings().engine });
    };
    state.recorder.start(100);
    state.startedAt = Date.now();
    state.timer = setInterval(() => { $('#session-time').textContent = `${((Date.now() - state.startedAt) / 1000).toFixed(1)}s`; }, 100);
    $('#record').classList.add('is-live'); $('#live-dot').classList.add('on');
    $('#record').disabled = true; $('#stop-record').disabled = false;
    status('Live capture running — use headphones before enabling monitor.', 'live');
  }

  async function listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
    $('#input-device').innerHTML = '<option value="">System default microphone</option>' + devices.map((device, index) => `<option value="${device.deviceId}">${A.sanitizeName(device.label || `Microphone ${index + 1}`)}</option>`).join('');
  }

  document.querySelectorAll('input[type=range]').forEach((input) => input.addEventListener('input', () => { syncReadouts(); updateLiveChain(); }));
  $('#record').onclick = () => startRecording().catch((error) => { stopStream(); status(`Microphone error: ${error.message}`, 'error'); });
  $('#stop-record').onclick = () => { if (state.recorder?.state === 'recording') state.recorder.stop(); };
  $('#preview').onclick = () => process().then((blob) => loadPlayer(blob, 'High-quality processed preview ready.')).catch((error) => status(error.message, 'error'));
  $('#save').onclick = () => save().catch((error) => status(error.message, 'error'));
  $('#add-mixer').onclick = async () => { const item = state.savedItem || await save(); localStorage.setItem('voice3.pendingMixerAudio', item.id); location.href = 'token-mixer.html'; };
  $('#replace').onclick = async () => { const item = state.savedItem || await save('Replacement voice clip'); localStorage.setItem('voice3.replaceMixerAudio', item.id); status(`${item.displayName} is queued as the replacement.`, 'success'); };
  $('#download').onclick = async () => { const blob = await process(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `muzikaz-voice-${Date.now()}.wav`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); };
  $('#duplicate').onclick = async () => { if (!state.savedItem) await save(); await A.itemFromBlob(state.savedItem.blob, { ...state.savedItem, id: undefined, displayName: `${state.savedItem.displayName} copy` }); status('Duplicated in Audio Library.', 'success'); };
  $('#mint').onclick = async () => { const item = state.savedItem || await save('Mintable Voice NFT'); localStorage.setItem('voice3.mintAudioId', item.id); A.dispatch('audio-nft-minted', { audioId: item.id, mode: 'pending-form' }); location.href = `checkout.html?mintAudioId=${encodeURIComponent(item.id)}`; };
  $('#monitor').onchange = () => { if (!state.monitor || !state.context) return; try { state.monitor.disconnect(state.context.destination); } catch (_) {} if ($('#monitor').checked) state.monitor.connect(state.context.destination); };
  $('#engine').onchange = () => status($('#engine').selectedOptions[0].dataset.note || 'Engine selected.');
  document.querySelectorAll('[data-preset]').forEach((button) => button.onclick = () => {
    const presets = { natural: [1, 1, .45, .15, false], deep: [.72, .9, .35, .2, false], hero: [.88, .96, .78, .12, false], cyber: [1.08, 1, .85, .28, true], chipmunk: [1.48, 1.18, .68, .08, false] };
    const [pitch, speed, character, echo, robot] = presets[button.dataset.preset];
    $('#pitch').value = pitch; $('#speed').value = speed; $('#character').value = character; $('#echo').value = echo; $('#robot').checked = robot;
    syncReadouts(); updateLiveChain(); status(`${button.textContent.trim()} voice loaded.`);
  });
  window.addEventListener('beforeunload', stopStream);
  navigator.mediaDevices?.addEventListener?.('devicechange', listDevices);
  $('#stop-record').disabled = true;
  syncReadouts(); listDevices();
}());
