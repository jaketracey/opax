export function catalogueReader(assets: { fetch(request: Request): Promise<Response> }): <T>(path: string) => Promise<T>;
