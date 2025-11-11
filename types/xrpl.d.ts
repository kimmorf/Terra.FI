declare module 'xrpl' {
  export class Client {
    constructor(endpoint: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    request<T = any>(options: Record<string, unknown>): Promise<{ result: T }>;
    autofill(tx: any): Promise<any>;
    submitAndWait(txBlob: string, options?: { timeoutMs?: number }): Promise<{ result: any }>;
    isConnected(): boolean;
  }
  
  export class Wallet {
    static fromSeed(seed: string): Wallet;
    static generate(): Wallet;
    address: string;
    classicAddress: string;
    publicKey: string;
    privateKey: string;
    seed?: string;
    sign(tx: any): { tx_blob: string };
  }
  
  export function isValidAddress(address: string): boolean;
  export function isValidClassicAddress(address: string): boolean;
  export function xrpToDrops(xrp: string): string;
  export function dropsToXrp(drops: string): string;
  
  export namespace validate {
    function isValidClassicAddress(address: string): boolean;
  }
}
