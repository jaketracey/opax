import {hydrateRegisterTables} from './register-tables.js?v=6204d3b689';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/(?:vic-gifts|state-bills|government-finance))\/?$/.test(location.pathname)) hydrateRegisterTables();
