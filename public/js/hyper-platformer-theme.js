/*
 * MUZIKAZ Hyper Platformer Theme
 *
 * An original, script-generated chiptune loop: bright square-wave lead,
 * triangle bass, and tiny arcade percussion. It uses Web Audio rather than
 * a sampled song, keeping the theme compact and consistent at every size.
 */
(function () {
  'use strict';

  var AudioEngine = window.AudioContext || window.webkitAudioContext;
  var context;
  var running = false;
  var starting = false;
  var nextBarAt = 0;
  var stepSeconds = 60 / 150 / 2;
  var status = document.getElementById('theme-status');
  var melody = [76, 79, 83, 79, 86, 83, 79, 76, 74, 77, 81, 77, 84, 81, 77, 74, 72, 76, 79, 76, 83, 79, 76, 72, 74, 77, 81, 84, 81, 77, 79, 76];
  var bass = [40, 40, 43, 43, 45, 45, 43, 43, 38, 38, 41, 41, 43, 43, 41, 41];

  function frequency(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  function voice(at, note, duration, type, volume, detune) {
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency(note), at);
    oscillator.detune.value = detune || 0;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  function blip(at, high) {
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(high ? 1250 : 105, at);
    oscillator.frequency.exponentialRampToValueAtTime(high ? 620 : 48, at + 0.055);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(high ? 0.018 : 0.032, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.07);
  }

  function scheduleBar(at, barNumber) {
    for (var step = 0; step < 16; step += 1) {
      var noteIndex = (barNumber * 16 + step) % melody.length;
      var beatAt = at + step * stepSeconds;
      if (step % 2 === 0) voice(beatAt, melody[noteIndex], stepSeconds * 0.76, 'square', 0.035, step % 4 ? 0 : 7);
      if (step % 4 === 0) voice(beatAt, bass[(barNumber * 4 + step / 4) % bass.length], stepSeconds * 1.7, 'triangle', 0.042);
      if (step % 4 === 0) blip(beatAt, false);
      if (step % 4 === 2) blip(beatAt, true);
    }
  }

  function keepPlaying() {
    while (nextBarAt < context.currentTime + 0.65) {
      scheduleBar(nextBarAt, Math.round(nextBarAt / (stepSeconds * 16)));
      nextBarAt += stepSeconds * 16;
    }
    window.setTimeout(keepPlaying, 180);
  }

  function startTheme() {
    if (running || starting || !AudioEngine) return;
    starting = true;
    context = new AudioEngine();
    context.resume().then(function () {
      running = true;
      nextBarAt = context.currentTime + 0.05;
      if (status) status.textContent = '♫ HYPER PLATFORMER THEME · ON';
      keepPlaying();
    }).catch(function () {
      starting = false;
      if (status) status.textContent = '♫ HYPER PLATFORMER THEME · READY';
    });
  }

  if (!AudioEngine) {
    if (status) status.textContent = '♫ HYPER PLATFORMER THEME · UNSUPPORTED';
    return;
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach(function (eventName) {
    window.addEventListener(eventName, startTheme, { once: true, passive: true });
  });
}());
