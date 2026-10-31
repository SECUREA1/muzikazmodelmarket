(() => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' }).catch((error) => {
      console.warn('MUZIKAZ app update could not be registered.', error);
    });
  });
})();
