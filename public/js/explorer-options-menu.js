(function mountExplorerOptionsMenu() {
  const root = document.querySelector('.explorer-options');
  if (!root) return;

  const toggle = root.querySelector('#explorer-options-toggle');
  const panel = root.querySelector('#explorer-options-panel');
  const search = root.querySelector('#explorer-options-search');
  const count = root.querySelector('#explorer-options-count');
  const empty = root.querySelector('#explorer-options-empty');
  const selectedLabel = root.querySelector('#explorer-options-label');
  const items = [...root.querySelectorAll('#explorer-options-list li')];
  const workspaces = [...document.querySelectorAll('[data-explorer-workspace]')];

  const normalize = (value) => value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const setOpen = (open, restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open) requestAnimationFrame(() => search.focus());
    else {
      search.value = '';
      filterOptions();
      if (restoreFocus) toggle.focus();
    }
  };

  function filterOptions() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    items.forEach((item) => {
      const searchableText = normalize(`${item.textContent} ${item.dataset.optionKeywords || ''}`);
      const matches = terms.every((term) => searchableText.includes(term));
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = `${visible} ${visible === 1 ? 'option' : 'options'}`;
    empty.hidden = visible !== 0;
  }

  function showWorkspace(link, { moveFocus = true } = {}) {
    const workspaceId = link.dataset.explorerView;
    const target = document.querySelector(link.hash);
    if (!workspaceId || !target) return false;

    workspaces.forEach((workspace) => {
      const selected = workspace.id === workspaceId;
      workspace.hidden = !selected;
      workspace.setAttribute('aria-hidden', String(!selected));
    });
    items.forEach((item) => {
      const itemLink = item.querySelector('a');
      itemLink.toggleAttribute('aria-current', itemLink === link);
    });
    selectedLabel.textContent = link.querySelector('b')?.textContent || 'Explorer options';
    document.title = `${selectedLabel.textContent} | MUZIKAZ VibeVerse`;

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: moveFocus ? 'smooth' : 'auto', block: 'center' });
      if (moveFocus && target.matches('button, select, input, [tabindex]')) {
        window.setTimeout(() => target.focus({ preventScroll: true }), 350);
      }
    });
    return true;
  }

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  root.querySelector('[data-close-explorer-options]').addEventListener('click', () => setOpen(false, true));
  search.addEventListener('input', filterOptions);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const firstMatch = items.find((item) => !item.hidden)?.querySelector('a');
      if (firstMatch) firstMatch.click();
    }
  });
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    if (!showWorkspace(link)) return;
    window.history.pushState(null, '', link.getAttribute('href'));
    setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!root.contains(event.target) && !panel.hidden) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false, true);
  });

  const linkForHash = () => items.map((item) => item.querySelector('a')).find((link) => link.hash === window.location.hash);
  showWorkspace(linkForHash() || items[0].querySelector('a'), { moveFocus: false });
  window.addEventListener('popstate', () => showWorkspace(linkForHash() || items[0].querySelector('a'), { moveFocus: false }));

  document.querySelectorAll('[data-product-category-picker]').forEach((picker) => {
    const categoryToggle = picker.querySelector('.product-category-picker__toggle');
    const categoryPanel = picker.querySelector('.product-category-picker__panel');
    const categoryLabel = picker.querySelector('[data-category-current]');
    const categoryButtons = [...picker.querySelectorAll('[data-product-category]')];
    const modelGrid = document.querySelector('#explorer-live-models-grid');
    let selectedCategory = categoryButtons[0]?.dataset.productCategory || 'avatars';
    const closeCategories = () => { categoryPanel.hidden = true; categoryToggle.setAttribute('aria-expanded', 'false'); };
    const selectCategory = (button, focus = false) => {
      selectedCategory = button.dataset.productCategory;
      categoryButtons.forEach((candidate) => {
        const active = candidate === button;
        candidate.setAttribute('aria-selected', String(active));
        candidate.tabIndex = active ? 0 : -1;
      });
      categoryLabel.textContent = button.querySelector('strong').textContent;
      modelGrid?.querySelectorAll('[data-product-category-card]').forEach((card) => { card.hidden = card.dataset.productCategoryCard !== selectedCategory; });
      const visibleCount = modelGrid?.querySelectorAll(`[data-product-category-card="${selectedCategory}"]:not([hidden])`).length || 0;
      const status = document.querySelector('#explorer-live-models-status');
      if (status && modelGrid?.children.length) status.textContent = `${visibleCount} ${categoryLabel.textContent.toLowerCase()} product${visibleCount === 1 ? '' : 's'} shown.`;
      closeCategories();
      if (focus) modelGrid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    categoryToggle?.addEventListener('click', () => {
      const opening = categoryPanel.hidden;
      categoryPanel.hidden = !opening;
      categoryToggle.setAttribute('aria-expanded', String(opening));
    });
    categoryButtons.forEach((button) => button.addEventListener('click', () => selectCategory(button, true)));
    modelGrid?.addEventListener('muzikaz:models-rendered', () => selectCategory(categoryButtons.find((button) => button.dataset.productCategory === selectedCategory) || categoryButtons[0]));
    document.addEventListener('click', (event) => { if (!picker.contains(event.target)) closeCategories(); });
    picker.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeCategories(); categoryToggle.focus(); } });
  });
}());
