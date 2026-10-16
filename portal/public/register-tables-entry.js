import {hydrateRegisterTables} from './register-tables.js?v=6d6808db5e';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/(?:vic-gifts|state-bills))\/?$/.test(location.pathname)) hydrateRegisterTables();
