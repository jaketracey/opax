// The voice assistant is a feature of the chat, not a surface of its own: the
// chat composer's mic button import()s this module the first time it is used
// and mounts the panel with that button as its trigger.
export { createVoiceAssistant } from './client.js';
