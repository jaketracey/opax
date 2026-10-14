import {hydrateRegisterTables} from './register-tables.js?v=fd99b44d19';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/vic-gifts)\/?$/.test(location.pathname)) hydrateRegisterTables();
