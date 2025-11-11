declare module 'xrpl' {
  export class Client {
    constructor(endpoint: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    request<T = any>(options: Record<string, unknown>): Promise<{ result: T }>;
  }
}
