'use client';

import { vanilla as CrossmarkSDK } from '@crossmarkio/sdk';

type CrossmarkSDKInstance = InstanceType<typeof CrossmarkSDK>;

let sdkInstance: CrossmarkSDKInstance | null = null;

export function getCrossmarkSDK(): CrossmarkSDKInstance | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!sdkInstance) {
    // O SDK do Crossmark pode não precisar do parâmetro project ou pode ter tipos específicos
    // Tentando sem parâmetros primeiro
    sdkInstance = new CrossmarkSDK();
  }

  return sdkInstance;
}

export function resetCrossmarkSDK() {
  sdkInstance = null;
}
