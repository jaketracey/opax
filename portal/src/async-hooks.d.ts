// nodejs_compat provides node:async_hooks; tsconfig loads no Node types, so this
// is the part src/server-timing.ts uses.
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined
    run<R>(store: T, callback: () => R): R
  }
}
