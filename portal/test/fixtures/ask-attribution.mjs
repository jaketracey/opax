import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('../../src/ask-attribution.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
export const {claimMatchesSpeaker,guardAnswerAttribution}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
