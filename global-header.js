(() => {
  const header = document.querySelector('.global-site-header');
  const button = header?.querySelector('.global-menu-toggle');
  const nav = header?.querySelector('.global-nav');
  if (!header || !button || !nav) return;

  const mobileQuery = window.matchMedia('(max-width: 720px)');
  const setOpen = (open, { restoreFocus = false } = {}) => {
    const isOpen = mobileQuery.matches && open;
    nav.classList.toggle('is-open', isOpen);
    button.classList.toggle('is-open', isOpen);
    button.setAttribute('aria-expanded', String(isOpen));
    button.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    nav.setAttribute('aria-hidden', String(mobileQuery.matches && !isOpen));
    document.body.classList.toggle('global-menu-open', isOpen);
    if (restoreFocus) button.focus();
  };

  const syncLayout = () => setOpen(false);
  button.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (nav.classList.contains('is-open') && !header.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false, { restoreFocus: true });
  });
  mobileQuery.addEventListener?.('change', syncLayout);
  window.addEventListener('orientationchange', syncLayout, { passive: true });
  syncLayout();
})();
