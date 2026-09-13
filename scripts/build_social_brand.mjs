// Raster exports of the existing Opax brand for platform profile fields.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../portal/package.json', import.meta.url));
const sharp = require('sharp');
const satori = require('satori').default;
const root = new URL('../portal/public/', import.meta.url);
const out = new URL('social/', root);
await mkdir(out, { recursive: true });
const logo = await readFile(new URL('favicon.svg', root));
await sharp(logo, { density: 2400 }).resize(800,800).png().toFile(new URL('opax-avatar.png',out).pathname);
const fonts = await Promise.all([
 ['Merriweather','merriweather-latin-400-normal.woff',400],
 ['Public Sans','public-sans-latin-600-normal.woff',600],
].map(async([name,file,weight])=>({name,data:await readFile(new URL('fonts/og/'+file,root)),weight,style:'normal'})));
const div=(style,children)=>({type:'div',props:{style:{display:'flex',...style},children}});
const svg=await satori(div({width:1500,height:500,background:'#142A43',color:'white',padding:'66px 80px 50px 355px',flexDirection:'column',borderBottom:'7px solid #D9A84A'},[
 div({fontFamily:'Public Sans',fontSize:24,fontWeight:600,color:'#D9A84A',letterSpacing:4},'OPAX  ·  AUSTRALIA'),
 div({fontFamily:'Merriweather',fontSize:58,lineHeight:1.18,marginTop:25,maxWidth:920},'Ask what your politicians actually said.'),
 div({fontFamily:'Public Sans',fontWeight:600,fontSize:25,color:'#B7C6D9',marginTop:32},'Public records. Source links. Room to question.'),
 div({fontFamily:'Public Sans',fontWeight:600,fontSize:23,color:'#D9A84A',marginTop:24},'opax.com.au'),
]),{width:1500,height:500,fonts});
await writeFile(new URL('opax-header.svg',out),svg);
await sharp(Buffer.from(svg)).png().toFile(new URL('opax-header.png',out).pathname);
