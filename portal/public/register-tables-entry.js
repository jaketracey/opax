// Start needed table downloads alongside the main app, rather than after it.
// Person and party pages still hydrate through their application renderers.
const app = document.querySelector('script[src^="/app.js"]');
const serverRegister = /^\/(?:instruments|audit|register\/(?:vic-gifts|state-bills|gov-advertising|government-finance|tax-expenditures))\/?$/.test(location.pathname);
if (serverRegister || app && /^\/subject\/(?:person|party|donor)\//.test(location.pathname)) {
  import('./register-tables.js?v=ba98f7415d').then(({hydrateRegisterTables}) => { if (serverRegister) hydrateRegisterTables(); });
}
// Sitting hubs keep their server-rendered vote table without the application.
if (app ? /^\/(?:bill|subject)\//.test(location.pathname) : document.querySelector('[data-vote-table]')) {
  import('./vote-tables.js?v=f14a0a91a9');
}
