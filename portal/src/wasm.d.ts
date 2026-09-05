// wrangler bundles `import x from './x.wasm'` as a compiled module
// (CompiledWasm rule); this is the type of that default export.
declare module '*.wasm' {
  const module: WebAssembly.Module
  export default module
}
