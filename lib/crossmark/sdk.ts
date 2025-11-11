'use client';

import { vanilla as CrossmarkSDK } from '@crossmarkio/sdk';

type CrossmarkSDKInstance = InstanceType<typeof CrossmarkSDK>;

let sdkInstance: CrossmarkSDKInstance | null = null;

export function getCrossmarkSDK(): CrossmarkSDKInstance | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!sdkInstance) {
    sdkInstance = new CrossmarkSDK({ project: 'Terra.FI' });
  }

  return sdkInstance;
}

export function resetCrossmarkSDK() {
  sdkInstance = null;
}
