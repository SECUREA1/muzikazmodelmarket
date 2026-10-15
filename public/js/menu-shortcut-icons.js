const paths={
 return:'<path d="m9 5 11 7-11 7Z"/>',
 worlds:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
 backpack:'<path d="M8 7V6a4 4 0 0 1 8 0v1M6 7h12l2 14H4ZM8 12h8v6H8Z"/>',
 tools:'<path d="m14 6 4-4a6 6 0 0 0-7 8L3 18a2 2 0 0 0 3 3l8-8a6 6 0 0 0 8-7l-4 4Z"/>',
 market:'<path d="M3 9h18l-2-6H5ZM5 9v12h14V9M9 21v-7h6v7"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
 care:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z"/><path d="M5 12h4l2-4 2 8 2-4h4"/>',
 builder:'<path d="M3 21h18M5 21V10h14v11M9 10V3h6v7M9 14v3m6-3v3M8 3h8"/>',
 inventory:'<path d="m3 7 9-4 9 4-9 4ZM3 7v10l9 4 9-4V7M12 11v10"/>',
 designer:'<path d="m4 16 12-12 4 4L8 20H4ZM13 7l4 4M4 4h5M4 8h2"/>',
 library:'<path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z"/>',
 publish:'<path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/>',
 live:'<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>'
};
export function shortcutIcon(key){return `<svg class="menu-shortcut-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key]||paths.inventory}</svg>`;}
export function shortcutKey(target){return ({'house-explorer-canvas':'return','house-world-button':'worlds','add-avatar':'backpack','house-tools':'tools','custom-item-toolkit':'designer','custom-item-library':'library','publish-model':'publish','live-published-models':'live','members.html#member-maps':'worlds','environment-builder.html':'builder','builder-market.html#backpack':'backpack','ioncore-rpg-market.html':'care','members.html#owned-collection':'inventory','members.html#designer':'designer','model-market.html':'market'})[String(target).replace(/^model-explorer\.html#|^#/,'')]||'inventory';}
