import {build} from 'esbuild';
const compiled=await build({entryPoints:[new URL('../src/sa-evidence.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
export const {saEvidenceText,saEvidenceRecord,saGenerationContext,saGenerationResponse,saConversationInput}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
