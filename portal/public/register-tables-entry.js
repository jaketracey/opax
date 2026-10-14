import {hydrateRegisterTables} from './register-tables.js?v=fba48f8357';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/(?:vic-gifts|state-bills))\/?$/.test(location.pathname)) hydrateRegisterTables();
