(() => {
  'use strict';

  const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

  async function getUserMedia(constraints, options = {}) {
    const modern = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    const request = modern
      ? (value) => modern(value)
      : legacyGetUserMedia
        ? (value) => new Promise((resolve, reject) => legacyGetUserMedia.call(navigator, value, resolve, reject))
        : null;
    if (!request) throw new DOMException('Microphone capture is not supported by this browser.', 'NotSupportedError');

    try {
      return await request(constraints);
    } catch (error) {
      // Older Safari/WebViews and some managed browsers reject individual audio
      // constraints even though they can provide the default microphone.
      if (options.relax !== false && constraints?.audio && error?.name !== 'NotAllowedError' && error?.name !== 'SecurityError') {
        return request({ audio:true, video:false });
      }
      throw error;
    }
  }

  function microphoneError(error) {
    if (!window.isSecureContext) return 'Microphone access requires HTTPS (or localhost). You can continue without talking.';
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Microphone permission was blocked. Allow it in this site’s browser settings, or continue in listen-only mode.';
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return 'No microphone was found. You can continue in listen-only mode.';
    if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return 'The microphone is busy in another app. Close it there, or continue in listen-only mode.';
    return error?.message || 'Microphone is unavailable. You can continue without it.';
  }

  const synthesis = window.speechSynthesis;
  const speechSupported = Boolean(synthesis && window.SpeechSynthesisUtterance);
  function unlockSpeech() {
    if (!speechSupported) return false;
    try {
      synthesis.resume();
      if (!synthesis.speaking && !synthesis.pending) {
        const utterance = new SpeechSynthesisUtterance(' ');
        utterance.volume = 0;
        synthesis.speak(utterance);
      }
      return true;
    } catch (error) {
      console.warn('[MUZIKAZ Media] Text-to-speech could not be unlocked.', error);
      return false;
    }
  }

  function speak(message, options = {}) {
    if (!speechSupported || !message) return false;
    try {
      synthesis.resume();
      const utterance = new SpeechSynthesisUtterance(String(message));
      utterance.lang = options.lang || document.documentElement.lang || navigator.language || 'en';
      utterance.rate = options.rate || 1;
      utterance.volume = options.volume ?? 1;
      const voices = synthesis.getVoices?.() || [];
      utterance.voice = voices.find((voice) => voice.lang === utterance.lang)
        || voices.find((voice) => voice.lang?.split('-')[0] === utterance.lang.split('-')[0])
        || null;
      synthesis.speak(utterance);
      return true;
    } catch (error) {
      console.warn('[MUZIKAZ Media] Text-to-speech playback was bypassed.', error);
      return false;
    }
  }

  window.MUZIKAZ_MEDIA = Object.freeze({ getUserMedia, microphoneError, speechSupported, unlockSpeech, speak });
})();
