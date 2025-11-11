export type CrossmarkNetwork = 'mainnet' | 'testnet' | 'devnet';

export interface CrossmarkAccount {
  address: string;
  network: CrossmarkNetwork;
  publicKey?: string;
}

export interface CrossmarkState {
  isInstalled: boolean;
  isConnected: boolean;
  isLoading: boolean;
  account: CrossmarkAccount | null;
  error?: string;
}

export interface CrossmarkContextValue extends CrossmarkState {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  refreshAccount: () => void;
}
