export type CrossmarkNetwork = 'mainnet' | 'testnet' | 'devnet';

export interface CrossmarkAccount {
  address: string;
  network: CrossmarkNetwork;
  publicKey?: string;
}

export interface MPTokenMetadata {
  name: string;
  description?: string;
  purpose?: string;
  geolocation?: string;
  legalReference?: string;
  externalUrl?: string;
  [key: string]: unknown;
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
  disconnect: () => void | Promise<void>;
  refreshAccount: () => void;
}
