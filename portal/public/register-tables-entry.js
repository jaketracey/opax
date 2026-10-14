import {hydrateRegisterTables} from './register-tables.js?v=2931d563d1';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/vic-gifts)\/?$/.test(location.pathname)) hydrateRegisterTables();
