import { useContext } from 'react';
import { NetworkContext, NetName } from './network-context.js';
import { makeLCD, LCD } from './lcd.js';

export type { NetName };
export const useNetwork = () => {
  return useContext(NetworkContext);
};

export interface NetworkConfig {
  api: LCD;
  chainName: string;
  netName: string;
  rpcAddrs: string[];
  apiAddrs: string[];
}

export const getNetConfigUrl = (netName: NetName) =>
  `https://${netName}.agoric.net/network-config`;

export const getNetworkConfig = async (
  netName: NetName,
  fetch: typeof window.fetch
): Promise<NetworkConfig> => {
  const response = await fetch(getNetConfigUrl(netName), {
    headers: { accept: 'application/json' },
  });
  const networkConfig = await response.json();
  if (!networkConfig?.chainName || !networkConfig?.rpcAddrs?.[0])
    throw new Error('Error fetching network config');

  const { apiAddrs, rpcAddrs } = networkConfig;
  const api = makeLCD(
    (Array.isArray(apiAddrs)
      ? (apiAddrs as string[])
      : ['http://localhost:1317'])[0],
    { fetch }
  );

  return {
    api,
    chainName: networkConfig.chainName,
    netName,
    apiAddrs,
    rpcAddrs,
  };
};
