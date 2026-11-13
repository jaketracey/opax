// Release builds time nothing: no clock reads, no marks, no file, no
// analytics. Every probe call in the app is one of these no-ops.
export function perfMark(_name: string, _detail?: string) {}
export function perfOnce(_name: string, _detail?: string) {}
export function perfHeap(_name: string) {}
export function useDrawnMark(_name: string, _detail?: string) {}
