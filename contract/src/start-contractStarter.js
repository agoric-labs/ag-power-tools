// @ts-check
import { E } from '@endo/far';

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
 * @param {{options?: { contractStarter?: { bundleID?: string }}}} [config]
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
    bundleID = Fail`bundleID required`,
  } = options?.contractStarter || {};

  const installation = await E(zoe).installBundleID(bundleID);
  produceInstallation.reset();
  produceInstallation.resolve(installation);
  return installation;
};

/**
 * @param {BootstrapPowers & ContractStarterPowers} powers
 * @param {{options?: { bundleID?: string }}} [_config]
 */
export const startContractStarter = async (
  {
    consume: { zoe },
    produce: { contractStarterKit: contractStarterStartResult },
    installation: {
      consume: { contractStarter: consumeInstallation },
    },
    instance: {
      produce: { contractStarter: produceInstance },
    },
  },
  _config,
) => {
  const installation = await consumeInstallation;

  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const startResult = await E(zoe).startInstance(installation, {
    Invitation: invitationIssuer,
  });
  contractStarterStartResult.resolve(startResult);
  const { instance } = startResult;
  produceInstance.reset();
  produceInstance.resolve(instance);
  return instance;
};
