(() => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let hadController=Boolean(navigator.serviceWorker.controller),reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(hadController&&!reloading){reloading=true;window.location.reload();}
    hadController=true;
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' }).catch((error) => {
      console.warn('MUZIKAZ app update could not be registered.', error);
    });
  });
})();
