// @ts-check
import { E } from '@endo/far';

export const contractName = 'launchIt';

/**
 *
 * @param {BootstrapPowers} powers
 * @param {*} config
 */
export const startLaunchIt = async (powers, config) => {
  const {
    consume: { zoe, chainTimerService },
    installation: {
      produce: { [contractName]: produceInstallation },
    },
    instance: {
      produce: { [contractName]: produceInstance },
    },
  } = powers;
  const { bundleID = Fail`no bundleID`, issuers = {} } =
    config.options?.[contractName] ?? {};
  /** @type {Installation<import('./launchIt.js').start>} */
  const installation = await E(zoe).installBundleID(bundleID);
  produceInstallation.resolve(installation);

  // TODO: use startUpgradeable
  const started = await E(zoe).startInstance(installation, issuers);
  produceInstance.resolve(started.instance);
};
