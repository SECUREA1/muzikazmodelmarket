const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const cartCount = document.querySelector('#cart-count');
const modelStatus = document.querySelector('#model-status');
let cartItems = 0;

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

nav?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    nav.classList.remove('is-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  }
});

document.querySelectorAll('.choice-btn').forEach((button) => {
  button.addEventListener('click', () => scrollToSection(button.dataset.target));
});

document.querySelectorAll('[data-model]').forEach((button) => {
  button.addEventListener('click', () => {
    const model = button.dataset.model;
    modelStatus.textContent = `${model} collection selected. Merch and signup actions are ready below.`;
    scrollToSection('models');
  });
});

document.querySelectorAll('[data-product]').forEach((button) => {
  button.addEventListener('click', () => {
    cartItems += 1;
    if (cartCount) cartCount.textContent = String(cartItems);
    button.textContent = 'Added';
    window.setTimeout(() => { button.textContent = 'Add'; }, 1200);
  });
});

document.querySelector('[data-action="search"]')?.addEventListener('click', () => {
  scrollToSection('models');
  modelStatus.textContent = 'Search shortcut opened the model collections.';
});

document.querySelector('[data-action="cart"]')?.addEventListener('click', () => {
  alert(cartItems ? `Cart ready with ${cartItems} item${cartItems === 1 ? '' : 's'}.` : 'Your MUZIKAZ cart is empty. Add merch to begin.');
});

document.querySelector('.newsletter form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input');
  alert(`Welcome to the crew${input.value ? ', ' + input.value : ''}!`);
  input.value = '';
});
