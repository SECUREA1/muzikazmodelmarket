const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const cartCount = document.querySelector('#cart-count');
const modelStatus = document.querySelector('#model-status');
const modelDetail = document.querySelector('#model-detail');
const modelDetailArt = document.querySelector('#model-detail-art');
const modelDetailTitle = document.querySelector('#model-detail-title');
const modelDetailCopy = document.querySelector('#model-detail-copy');
const addModelButton = document.querySelector('[data-add-model]');
let cartItems = 0;
let selectedModel = '';

const modelCopy = {
  Originals: 'The Icons: classic crew starters, mascot poses, and brand-ready character assets.',
  Legends: 'The Unstoppable: armored future icons with neon stage presence and bold silhouettes.',
  Beasts: 'The Untamed: monster-powered renders with fantasy energy and safe presentation rules.',
  Crew: 'The Squad: street-smart mascots, fan favorites, and friendly drop-ready characters.',
  Chaos: 'The Wildcards: high-energy hybrids for creators who want the loudest MUZIKAZ look.',
};

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function closeMenu() {
  nav?.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded', 'false');
}

function updateCart(button, label = 'Added') {
  cartItems += 1;
  if (cartCount) cartCount.textContent = String(cartItems);
  if (!button) return;
  const originalText = button.textContent;
  button.textContent = label;
  window.setTimeout(() => { button.textContent = originalText; }, 1200);
}

menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

nav?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    document.querySelectorAll('.nav a').forEach((link) => link.classList.remove('active'));
    event.target.classList.add('active');
    closeMenu();
  }
});

document.querySelectorAll('[data-model]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedModel = button.dataset.model;
    if (modelStatus) modelStatus.textContent = `${selectedModel} collection selected. Preview is open and ready to add to cart.`;
    if (modelDetailTitle) modelDetailTitle.textContent = selectedModel;
    if (modelDetailCopy) modelDetailCopy.textContent = modelCopy[selectedModel] || 'MUZIKAZ model collection ready to preview.';
    if (modelDetailArt) modelDetailArt.className = `model-detail-art ${button.closest('.card')?.classList[1] || ''}`;
    if (modelDetail) modelDetail.hidden = false;
    scrollToSection('model-detail');
  });
});

addModelButton?.addEventListener('click', () => {
  if (!selectedModel) {
    if (modelStatus) modelStatus.textContent = 'Choose a model collection before adding it to cart.';
    scrollToSection('models');
    return;
  }
  updateCart(addModelButton, 'Model added');
  if (modelStatus) modelStatus.textContent = `${selectedModel} model added to your cart.`;
});

document.querySelector('[data-show-all]')?.addEventListener('click', (event) => {
  event.preventDefault();
  if (modelDetail) modelDetail.hidden = true;
  if (modelStatus) modelStatus.textContent = 'All MUZIKAZ model collections are visible.';
  scrollToSection('models');
});

document.querySelectorAll('[data-product]').forEach((button) => {
  button.addEventListener('click', () => updateCart(button));
});

document.querySelector('[data-action="search"]')?.addEventListener('click', () => {
  scrollToSection('models');
  if (modelStatus) modelStatus.textContent = 'Search shortcut opened the model collections.';
});

document.querySelector('[data-action="cart"]')?.addEventListener('click', () => {
  alert(cartItems ? `Cart ready with ${cartItems} item${cartItems === 1 ? '' : 's'}.` : 'Your MUZIKAZ cart is empty. Add merch or models to begin.');
});

document.querySelector('.newsletter form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input');
  alert(`Welcome to the crew${input.value ? ', ' + input.value : ''}!`);
  input.value = '';
});


document.querySelectorAll('.choice-btn[data-target]').forEach((button) => {
  button.addEventListener('click', () => {
    scrollToSection(button.dataset.target);
    closeMenu();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});
