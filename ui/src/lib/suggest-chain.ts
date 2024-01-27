/**
 * @file ported from @agoric/web-compoonents
 */

import {
  Bech32Config,
  FeeCurrency,
  ChainInfo,
  Window as KeplrWindow,
} from '@keplr-wallet/types';
import { NetworkConfig } from './network-hook.ts';

export const stakeCurrency: FeeCurrency = {
  coinDenom: 'BLD',
  coinMinimalDenom: 'ubld',
  coinDecimals: 6,
  coinGeckoId: undefined,
  gasPriceStep: {
    low: 0,
    average: 0,
    high: 0,
  },
};

export const stableCurrency: FeeCurrency = {
  coinDenom: 'IST',
  coinMinimalDenom: 'uist',
  coinDecimals: 6,
  coinGeckoId: undefined,
  gasPriceStep: {
    low: 0,
    average: 0,
    high: 0,
  },
};

export const bech32Config: Bech32Config = {
  bech32PrefixAccAddr: 'agoric',
  bech32PrefixAccPub: 'agoricpub',
  bech32PrefixValAddr: 'agoricvaloper',
  bech32PrefixValPub: 'agoricvaloperpub',
  bech32PrefixConsAddr: 'agoricvalcons',
  bech32PrefixConsPub: 'agoricvalconspub',
};

export const AGORIC_COIN_TYPE = 564;
export const COSMOS_COIN_TYPE = 118;

interface AgoricNetworkConfig {
  rpcAddrs: string[];
  apiAddrs: string[];
  chainName: string;
}

const makeChainInfo = (
  networkConfig: AgoricNetworkConfig,
  caption: string,
  randomFloat: number,
  walletUrlForStaking: string | undefined
): ChainInfo => {
  const { chainName, rpcAddrs, apiAddrs } = networkConfig;
  const index = Math.floor(randomFloat * rpcAddrs.length);

  const rpcAddr = rpcAddrs[index];
  const rpc = rpcAddr.match(/:\/\//) ? rpcAddr : `http://${rpcAddr}`;

  const rest = apiAddrs ? apiAddrs[index] : rpc.replace(/(:\d+)?$/, ':1317');

  return {
    rpc,
    rest,
    chainId: chainName,
    chainName: caption,
    stakeCurrency,
    walletUrlForStaking,
    bip44: {
      coinType: AGORIC_COIN_TYPE,
    },
    bech32Config,
    currencies: [stakeCurrency, stableCurrency],
    feeCurrencies: [stableCurrency],
    features: ['stargate', 'ibc-transfer'],
  };
};

export async function suggestChain(
  networkConfig: NetworkConfig,
  caption?: string
): Promise<ChainInfo> {
  const { keplr } = window as KeplrWindow;

  if (!keplr) {
    throw Error('Missing Keplr');
  }

  const { netName } = networkConfig;
  if (!caption) {
    caption = `Agoric ${netName}`;
  }

  const walletUrlForStaking = `https://${netName}.staking.agoric.app`;

  const chainInfo = makeChainInfo(
    networkConfig,
    caption,
    Math.random(),
    walletUrlForStaking
  );
  console.debug('chainInfo', chainInfo);
  await keplr.experimentalSuggestChain(chainInfo);

  return chainInfo;
}
