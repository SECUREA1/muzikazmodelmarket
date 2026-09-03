(function () {
  'use strict';

  var options = Array.prototype.slice.call(document.querySelectorAll('[data-entry-option]'));
  var launchButton = document.querySelector('#game-entry-launch');
  var status = document.querySelector('#game-entry-status');
  var adminForm = document.querySelector('#game-entry-admin-form');
  var adminPassword = document.querySelector('#game-entry-admin-password');
  var adminSubmit = document.querySelector('#game-entry-admin-submit');
  var selected = '';

  function saveAndEnter(type, loadout) {
    window.localStorage.setItem('muzikazGameEntry', type);
    window.localStorage.setItem('muzikazStarterLoadout', JSON.stringify(loadout));
    window.sessionStorage.setItem('muzikazBottleMember', 'true');
    status.textContent = 'Loadout equipped. Opening RAD-TOX…';
    window.location.assign('model-market.html?access=' + encodeURIComponent(type) + '#house-explorer');
  }

  function selectOption(option) {
    selected = option.dataset.entryOption;
    options.forEach(function (button) {
      var active = button === option;
      button.setAttribute('aria-checked', String(active));
      button.classList.toggle('is-selected', active);
      button.querySelector('b').textContent = active ? 'Selected' : 'Select';
    });
    launchButton.disabled = false;
    status.textContent = (selected === 'meknx' ? 'MEKNX' : 'Pay') + ' loadout selected. You are ready to enter RAD-TOX.';
  }

  options.forEach(function (option) {
    option.addEventListener('click', function () { selectOption(option); });
  });

  launchButton.addEventListener('click', function () {
    if (!selected) return;
    var loadout = {
      type: selected,
      balance: 500,
      avatar: 'MUZKAT',
      land: 'starter-land',
      backpack: true
    };
    saveAndEnter(selected, loadout);
  });

  adminForm.addEventListener('submit', function (event) {
    event.preventDefault();
    adminSubmit.disabled = true;
    status.textContent = 'Opening the saved admin account and loadout…';
    fetch('/api/access/admin-bypass', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password: adminPassword.value })
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (result) {
        if (!response.ok || !result.success) throw new Error(result.message || 'The admin word was not accepted.');
        return result.data;
      });
    }).then(function (session) {
      var account = session.account;
      saveAndEnter('admin', {
        type: 'admin',
        accountId: account.accountId,
        backpackId: account.backpackId,
        balance: account.mzkBalance,
        avatar: account.selectedAvatar || 'MUZKAT',
        land: 'admin-land',
        backpack: true,
        saved: true
      });
    }).catch(function (error) {
      status.textContent = error.message || 'The saved admin account could not be opened.';
      adminPassword.focus();
    }).finally(function () {
      adminSubmit.disabled = false;
    });
  });
}());
