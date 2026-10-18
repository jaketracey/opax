import {hydrateRegisterTables} from './register-tables.js?v=48933202e9';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/(?:vic-gifts|state-bills|gov-advertising|government-finance|tax-expenditures))\/?$/.test(location.pathname)) hydrateRegisterTables();
