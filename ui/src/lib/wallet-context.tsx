import type { ReactNode } from 'react';
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { SigningStargateClient } from '@cosmjs/stargate';
import type { RpcClient } from '@cosmjs/tendermint-rpc';
import { Decimal } from '@cosmjs/math';
import { AccountData, Window as KeplrWindow } from '@keplr-wallet/types';
import { suggestChain } from './suggest-chain.ts';
import { useNetwork } from './network-hook.ts';
import { makeHttpClient } from './rpc-client.ts';

interface WalletContext {
  walletAddress: string | null;
  connectWallet: () => Promise<void>;
  stargateClient: SigningStargateClient | undefined;
  isLoading: boolean;
  rpc: RpcClient | null;
}

export const WalletContext = createContext<WalletContext>({
  walletAddress: null,
  connectWallet: async () => {},
  stargateClient: undefined,
  isLoading: false,
  rpc: null,
});

export const WalletContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { localStorage } = window; // XXX hoist to arg?
  const keplr = (window as KeplrWindow).keplr;
  const stargateClient = useRef<SigningStargateClient | undefined>(undefined);
  const [rpc, setRpc] = useState<WalletContext['rpc']>(null);
  const net = useNetwork();
  const [currNetName, setCurrNetName] = useState(net.netName);
  const [walletAddress, setWalletAddress] = useState<
    WalletContext['walletAddress']
  >(() => {
    if (localStorage.getItem('walletAddress')) {
      return localStorage.getItem('walletAddress') || null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const saveAddress = ({ address }: AccountData) => {
    localStorage.setItem('walletAddress', address);
    setWalletAddress(address);
  };

  const connectWallet = useCallback(async () => {
    if (!keplr) return;
    const { networkConfig } = net;
    if (!networkConfig) return;
    setIsLoading(true);
    const { chainId, rpc } = await suggestChain(networkConfig);
    setRpc(makeHttpClient(rpc, fetch));
    if (chainId) {
      await keplr.enable(chainId);
      const offlineSigner = keplr.getOfflineSigner(chainId);
      const accounts = await offlineSigner.getAccounts();
      if (accounts?.[0].address !== walletAddress) {
        saveAddress(accounts[0]);
      }
      try {
        stargateClient.current = await SigningStargateClient.connectWithSigner(
          rpc,
          offlineSigner,
          {
            gasPrice: {
              denom: 'uist',
              amount: Decimal.fromUserInput('50000000', 0),
            },
          }
        );
      } catch (e) {
        console.error('error stargateClient setup', e);
        localStorage.removeItem('walletAddress');
      } finally {
        setIsLoading(false);
      }
    }
  }, [walletAddress]);

  const { netName } = net;
  if (netName && currNetName !== netName) {
    if (walletAddress) connectWallet();
    setCurrNetName(netName);
  }

  useEffect(() => {
    if (!netName && stargateClient.current) {
      stargateClient.current = undefined;
      return;
    }
    if (walletAddress && netName && !stargateClient.current) {
      connectWallet();
    }
  }, [walletAddress, netName, connectWallet]);

  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        connectWallet,
        stargateClient: stargateClient.current,
        isLoading,
        rpc,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
