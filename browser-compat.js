/* Browser capability gate. Keep this file ES5 so Internet Explorer 11 can run it. */
(function () {
  var legacyInternetExplorer = !!document.documentMode;

  if (!legacyInternetExplorer) {
    /* document.write keeps the application bundle parser-blocking, as a normal script tag. */
    document.write('<script src="script.js"><\\/script>');
    return;
  }

  /* IE never loads the inert application-script placeholder that follows this gate. */

  function showBasicMode() {
    var notice = document.createElement('div');
    notice.className = 'browser-compat-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<strong>Basic browsing mode is active.</strong> Internet Explorer can browse this catalog and use its links, but it cannot run modern 3D, AR, camera, upload, or live-dashboard features. Open this page in a current version of Google Chrome or Mozilla Firefox for the full MUZIKAZ Model Market.';
    var body = document.body;
    if (body.firstChild) body.insertBefore(notice, body.firstChild);
    else body.appendChild(notice);
  }

  if (document.body) showBasicMode();
  else if (document.addEventListener) document.addEventListener('DOMContentLoaded', showBasicMode);
  else window.attachEvent('onload', showBasicMode);
}());
