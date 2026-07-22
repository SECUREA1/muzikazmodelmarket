/* MUZIKAZ Battle Theme — original Web Audio soundtrack, enabled after a user gesture. */
(function () {
  'use strict';

  var AudioEngine = window.AudioContext || window.webkitAudioContext;
  var context;
  var master;
  var running = false;
  var nextStepAt = 0;
  var step = 0;
  var timer;
  var button;
  var status;
  var BPM = 150;
  var stepLength = 60 / BPM / 4;
  var bassline = [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42];
  var lead = [659.25, 783.99, 880, 1046.5, 880, 783.99, 659.25, 587.33];

  function addUi() {
    var dock = document.createElement('div');
    dock.className = 'battle-theme-dock';
    dock.innerHTML = '<button type="button" class="battle-theme-toggle" aria-pressed="false">♫ Start battle music</button><span class="battle-theme-status" role="status">150 BPM battle mode ready</span>';
    document.body.appendChild(dock);
    button = dock.querySelector('button');
    status = dock.querySelector('span');
    button.addEventListener('click', function () { running ? stop() : start(); });
  }

  function updateUi() {
    if (!button) return;
    button.setAttribute('aria-pressed', String(running));
    button.textContent = running ? '♫ Battle music on' : '♫ Start battle music';
    status.textContent = running ? '150 BPM battle music playing' : '150 BPM battle mode ready';
  }

  function tone(at, frequency, length, type, volume, slideTo) {
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + length);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain).connect(master);
    oscillator.start(at);
    oscillator.stop(at + length + 0.03);
  }

  function noise(at, length, volume) {
    var buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    var source = context.createBufferSource();
    var filter = context.createBiquadFilter();
    var gain = context.createGain();
    filter.type = 'highpass';
    filter.frequency.value = 4200;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(master);
    source.start(at);
    source.stop(at + length + 0.02);
  }

  function schedule(at, currentStep) {
    var beat = currentStep % 16;
    if (beat % 4 === 0) {
      tone(at, 118, 0.13, 'sine', 0.13, 46);
      tone(at, 55, 0.21, 'triangle', 0.065, 38);
    }
    if (beat === 4 || beat === 12) noise(at, 0.16, 0.1);
    noise(at, 0.025, beat % 2 ? 0.02 : 0.012);
    if (beat % 2 === 0) tone(at, bassline[(beat / 2) % bassline.length], 0.16, 'sawtooth', 0.035);
    if ([2, 6, 10, 14].indexOf(beat) !== -1) tone(at, lead[((beat - 2) / 4) % lead.length], 0.08, 'square', 0.02);
    if (beat === 15) tone(at, 1318.51, 0.11, 'square', 0.025, 880);
  }

  function scheduleLoop() {
    if (!running || !context) return;
    while (nextStepAt < context.currentTime + 0.16) {
      schedule(nextStepAt, step);
      nextStepAt += stepLength;
      step = (step + 1) % 16;
    }
    timer = window.setTimeout(scheduleLoop, 50);
  }

  function start() {
    if (running || !AudioEngine) return;
    context = context || new AudioEngine();
    master = master || context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    context.resume().then(function () {
      running = true;
      nextStepAt = context.currentTime + 0.04;
      step = 0;
      scheduleLoop();
      updateUi();
    }).catch(function () {
      if (status) status.textContent = 'Tap battle music to enable sound';
    });
  }

  function stop() {
    running = false;
    window.clearTimeout(timer);
    if (context) context.suspend();
    updateUi();
  }

  function gestureStart() { start(); }

  if (!AudioEngine) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addUi, { once: true });
  else addUi();
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (eventName) {
    window.addEventListener(eventName, gestureStart, { once: true, passive: true });
  });
}());
