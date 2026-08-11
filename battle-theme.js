/* MUZIKAZ Battle Theme — a continuously generated, ever-changing Web Audio soundtrack. */
(function () {
  'use strict';

  var AudioEngine = window.AudioContext || window.webkitAudioContext;
  var context;
  var master;
  var compressor;
  var running = false;
  var starting = false;
  var nextStepAt = 0;
  var step = 0;
  var timer;
  var BPM = 158;
  var stepLength = 60 / BPM / 4;
  var bassline = [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42];
  var lead = [659.25, 783.99, 880, 1046.5, 880, 783.99, 659.25, 587.33];
  var chords = [220, 261.63, 293.66, 329.63];
  var pattern = randomPattern();
  var bar = 0;

  function chance(probability) { return Math.random() < probability; }

  function randomPattern() {
    var hats = [];
    var bass = [];
    var leadNotes = [];
    var shakers = [];
    for (var i = 0; i < 16; i += 1) {
      hats[i] = chance(i % 2 ? 0.96 : 0.62);
      shakers[i] = chance(i % 2 ? 0.64 : 0.28);
      bass[i] = i % 2 === 0 && chance(i % 4 === 0 ? 0.95 : 0.58);
      leadNotes[i] = i % 2 === 0 && chance(0.48);
    }
    return {
      kicks: [0, 3, 4, 7, 8, 10, 12, 14].filter(function (beat) { return chance(beat % 4 === 0 ? 0.96 : 0.38); }),
      snares: [4, 7, 12, 15].filter(function (beat) { return chance(beat % 4 === 0 ? 0.98 : 0.3); }),
      hats: hats,
      shakers: shakers,
      bass: bass,
      leadNotes: leadNotes,
      fill: chance(0.72)
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

  function noise(at, length, volume, frequency, filterType) {
    var buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    var source = context.createBufferSource();
    var filter = context.createBiquadFilter();
    var gain = context.createGain();
    filter.type = filterType || 'highpass';
    filter.frequency.value = frequency || 4200;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(master);
    source.start(at);
    source.stop(at + length + 0.02);
  }

  function chord(at, root) {
    [1, 1.25, 1.5].forEach(function (ratio, index) {
      tone(at + index * 0.004, root * ratio, stepLength * 3.4, 'sawtooth', 0.009, root * ratio * 0.995);
    });
  }

  function schedule(at, currentStep) {
    var beat = currentStep % 16;
    if (beat === 0 && currentStep > 0) {
      pattern = randomPattern();
      bar += 1;
    }
    if (pattern.kicks.indexOf(beat) !== -1) {
      tone(at, 118, 0.13, 'sine', 0.13, 46);
      tone(at, 55, 0.21, 'triangle', 0.065, 38);
    }
    if (pattern.snares.indexOf(beat) !== -1) {
      noise(at, 0.16, 0.075, 1700, 'bandpass');
      noise(at + 0.008, 0.065, 0.04, 5200, 'highpass');
    }
    if (pattern.hats[beat]) noise(at, beat === 14 ? 0.11 : 0.025, beat % 2 ? 0.025 : 0.016, 6500, 'highpass');
    if (pattern.shakers[beat]) noise(at + stepLength * 0.44, 0.018, 0.009, 9000, 'bandpass');
    if (pattern.bass[beat]) tone(at, bassline[(beat / 2 | 0) % bassline.length], 0.19, 'sawtooth', 0.038);
    if (pattern.leadNotes[beat]) tone(at, lead[(beat / 2 | 0) % lead.length], 0.09, beat % 4 ? 'square' : 'sawtooth', 0.018);
    if (beat % 4 === 0) chord(at, chords[(bar + beat / 4) % chords.length]);
    if (beat === 15 && pattern.fill) {
      tone(at - stepLength, 164.81, stepLength * 0.7, 'triangle', 0.04, 246.94);
      tone(at, 1318.51, 0.11, 'square', 0.025, 880);
      noise(at, 0.12, 0.035, 2600, 'bandpass');
    }
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
    if (!compressor) {
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      master.gain.value = 0.62;
      master.connect(compressor).connect(context.destination);
    }
    context.resume().then(function () {
      starting = false;
      running = true;
      nextStepAt = context.currentTime + 0.04;
      step = 0;
      bar = 0;
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
