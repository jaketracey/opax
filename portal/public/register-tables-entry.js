import {hydrateRegisterTables} from './register-tables.js?v=e7e53b4396';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/(?:vic-gifts|state-bills|government-finance|tax-expenditures))\/?$/.test(location.pathname)) hydrateRegisterTables();
