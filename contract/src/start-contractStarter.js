// @ts-check
import { E } from '@endo/far';
import { allValues, mapValues } from './objectTools.js';
import { boardAuxChild, makeBoardAuxNode, publish } from './boardAux.js';
import { fixHub } from './fixHub.js';

const { Fail } = assert;

/**
 * @typedef { typeof import('../src/contractStarter.js').start } ContractStarterFn
 *
 * @typedef {{
 *   produce: { contractStarterKit: Producer<unknown> },
 *   installation: {
 *     consume: { contractStarter: Promise<Installation<ContractStarterFn>> },
 *     produce: { contractStarter: Producer<Installation<ContractStarterFn>> },
 *   }
 *   instance: {
 *     consume: { contractStarter: Promise<StartedInstanceKit<ContractStarterFn>['instance']> },
 *     produce: { contractStarter: Producer<StartedInstanceKit<ContractStarterFn>['instance']> },
 *   }
 * }} ContractStarterPowers
 */

/**
 * @param {BootstrapPowers & ContractStarterPowers} powers
 * @param {{options?: { contractStarter?: { bundleID?: string, label?: string }}}} [config]
 */
export const installContractStarter = async (
  {
    consume: { zoe },
    installation: {
      produce: { contractStarter: produceInstallation },
    },
  },
  { options } = {},
) => {
  const {
    // rendering this template requires not re-flowing the next line
    bundleID = Fail`contractStarter bundleID required`,
    label = 'contractStarter',
  } = options?.contractStarter || {};

  const installation = await E(zoe).installBundleID(bundleID, label);
  produceInstallation.reset();
  produceInstallation.resolve(installation);
  return installation;
};

/** @typedef {{ brand: string} & ({ value: bigint } | { value: number, digits?: number })} AmountData */

const free = { brand: 'IST', value: 0n };
/** @type {PriceConfig} */
const defaultPrices = {
  installBundleID: free,
  startInstance: free,
  storageNode: free,
  timerService: free,
  board: free,
  priceAuthority: free,
};

/**
 * @param {BootstrapPowers & ContractStarterPowers} powers
 * @param {{options?: { contractStarter?: {
 *   bundleID?: string,
 *   prices?: PriceConfig,
 *   label?: string,
 * }}}} [config]
 *
 * @typedef {Record<keyof import('../src/contractStarter.js').Prices, AmountData>} PriceConfig
 */
export const startContractStarter = async (
  {
    consume: {
      zoe,
      chainStorage,
      chainTimerService,
      priceAuthority,
      board,
      agoricNames,
      namesByAddressAdmin,
    },
    produce: { contractStarterKit: contractStarterStartResult },
    installation: {
      consume: { contractStarter: consumeInstallation },
    },
    instance: {
      produce: { contractStarter: produceInstance },
    },
    brand: { consume: brandConsume },
  },
  config,
) => {
  const installation = await consumeInstallation;

  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const feeIssuer = await E(zoe).getFeeIssuer();

  const namesByAddress = await fixHub(namesByAddressAdmin);
  const storage = (await chainStorage) || Fail`storage`; // XXX
  const privateArgs = await allValues({
    storageNode: makeBoardAuxNode(storage),
    timerService: chainTimerService,
    board,
    priceAuthority,
  });

  /** @type {(a: AmountData) => bigint } */
  const toValue = a =>
    typeof a.value === 'bigint'
      ? a.value
      : BigInt(a.value * 1 ** (a.digits || 1));
  /** @type {(a: AmountData) => Promise<Brand<'nat'>>} */
  const toBrand = a => brandConsume[a.brand];
  /** @param {AmountData} a } */
  const toAmountP = a =>
    allValues(harden({ brand: toBrand(a), value: toValue(a) }));
  /** @type {import('../src/contractStarter.js').Prices} */
  const prices = await allValues(
    mapValues(
      { ...defaultPrices, ...config?.options?.contractStarter?.prices },
      toAmountP,
    ),
  );
  const terms = await allValues({
    prices,
    namesByAddress,
    agoricNames,
  });

  const { label = 'contractStarter' } = config?.options?.contractStarter || {};
  const startResult = await E(zoe).startInstance(
    installation,
    { Invitation: invitationIssuer, Fee: feeIssuer },
    terms,
    privateArgs,
    label,
  );
  contractStarterStartResult.resolve(startResult);

  const { instance } = startResult;

  const id = await E(board).getId(instance);
  const startedTerms = await E(zoe).getTerms(instance);
  const m = E(board).getPublishingMarshaller();
  publish(boardAuxChild(storage, id), { terms: startedTerms, label }, m);

  produceInstance.reset();
  produceInstance.resolve(instance);
  return instance;
};

export const permit = {
  consume: {
    zoe: true,
    chainStorage: true,
    chainTimerService: true,
    priceAuthority: true,
    board: true,
    agoricNames: true,
    namesByAddressAdmin: true,
  },
  produce: { contractStarterKit: true },
  installation: {
    produce: { contractStarter: true },
    consume: { contractStarter: true },
  },
  instance: { produce: { contractStarter: true } },
  brand: { consume: { IST: true } },
};

export const main = async powers => {
  await installContractStarter(powers);
  await startContractStarter(powers);
};
