/* MUZIKAZ Battle Theme — a continuously generated, ever-changing Web Audio soundtrack. */
(function () {
  'use strict';

  var AudioEngine = window.AudioContext || window.webkitAudioContext;
  var context;
  var master;
  var running = false;
  var starting = false;
  var nextStepAt = 0;
  var step = 0;
  var timer;
  var BPM = 150;
  var stepLength = 60 / BPM / 4;
  var bassline = [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42];
  var lead = [659.25, 783.99, 880, 1046.5, 880, 783.99, 659.25, 587.33];
  var pattern = randomPattern();

  function chance(probability) { return Math.random() < probability; }

  function randomPattern() {
    var hats = [];
    var bass = [];
    var leadNotes = [];
    for (var i = 0; i < 16; i += 1) {
      hats[i] = chance(i % 2 ? 0.86 : 0.42);
      bass[i] = i % 2 === 0 && chance(i % 4 === 0 ? 0.95 : 0.58);
      leadNotes[i] = i % 2 === 0 && chance(0.36);
    }
    return {
      kicks: [0, 4, 8, 12].filter(function (beat) { return chance(beat === 0 ? 1 : 0.78); }),
      snares: [4, 12].filter(function () { return chance(0.92); }),
      hats: hats,
      bass: bass,
      leadNotes: leadNotes,
      fill: chance(0.55)
    };
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
    if (beat === 0 && currentStep > 0) pattern = randomPattern();
    if (pattern.kicks.indexOf(beat) !== -1) {
      tone(at, 118, 0.13, 'sine', 0.13, 46);
      tone(at, 55, 0.21, 'triangle', 0.065, 38);
    }
    if (pattern.snares.indexOf(beat) !== -1) noise(at, 0.16, 0.1);
    if (pattern.hats[beat]) noise(at, 0.025, beat % 2 ? 0.024 : 0.014);
    if (pattern.bass[beat]) tone(at, bassline[(beat / 2 | 0) % bassline.length], 0.16, 'sawtooth', 0.035);
    if (pattern.leadNotes[beat]) tone(at, lead[(beat / 2 | 0) % lead.length], 0.08, 'square', 0.02);
    if (beat === 15 && pattern.fill) tone(at, 1318.51, 0.11, 'square', 0.025, 880);
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
    if (!AudioEngine || starting) return;
    if (running) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    starting = true;
    context = context || new AudioEngine();
    master = master || context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    context.resume().then(function () {
      starting = false;
      running = true;
      nextStepAt = context.currentTime + 0.04;
      step = 0;
      pattern = randomPattern();
      scheduleLoop();
    }).catch(function () {
      starting = false;
      // Browsers that block autoplay will start it on the first interaction below.
    });
  }

  if (!AudioEngine) return;
  start();
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (eventName) {
    window.addEventListener(eventName, start, { once: true, passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) start();
  });
}());
