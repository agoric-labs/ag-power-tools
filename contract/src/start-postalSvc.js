/**
 * @file core eval script* to start the postalSvc contract.
 *
 * * see test-gimix-proposal.js to make a script from this file.
 *
 * The `permit` export specifies the corresponding permit.
 */
// @ts-check

import { E } from '@endo/far';
import { fixHub } from './fixHub.js';

const trace = (...args) => console.log('start-postalSvc', ...args);

const fail = msg => {
  throw Error(msg);
};

/**
 * @typedef { typeof import('../src/postalSvc.js').start } PostalSvcFn
 *
 * @typedef {{
 *   produce: { postalSvcKit: Producer<unknown> },
 *   installation: {
 *     consume: { postalSvc: Promise<Installation<PostalSvcFn>> },
 *     produce: { postalSvc: Producer<Installation<PostalSvcFn>> },
 *   }
 *   instance: {
 *     consume: { postalSvc: Promise<StartedInstanceKit<PostalSvcFn>['instance']> },
 *     produce: { postalSvc: Producer<StartedInstanceKit<PostalSvcFn>['instance']> },
 *   }
 * }} PostalSvcPowers
 */
/**
 * @deprecated use contractStarter
 * a la starterSam in ../test/market-actors.js
 *
 * @param {BootstrapPowers & PostalSvcPowers} powers
 * @param {{ options?: { postalSvc: {
 *   bundleID: string;
 *   issuerNames?: string[];
 * }}}} config
 */
export const startPostalSvc = async (powers, config) => {
  console.warn('DEPRECATED. Use contractStarter. See starterSam example.');

  const {
    consume: { zoe, namesByAddressAdmin },
    installation: {
      produce: { postalSvc: produceInstallation },
    },
    instance: {
      produce: { postalSvc: produceInstance },
    },
    issuer: { consume: consumeIssuer },
  } = powers;
  const {
    bundleID = fail(`no bundleID`),
    issuerNames = ['IST', 'Invitation'],
  } = config.options?.postalSvc ?? {};

  /** @type {Installation<PostalSvcFn>} */
  const installation = await E(zoe).installBundleID(bundleID);
  produceInstallation.resolve(installation);

  const namesByAddress = await fixHub(namesByAddressAdmin);

  const issuers = Object.fromEntries(
    issuerNames.map(n => [n, consumeIssuer[n]]),
  );
  const { instance } = await E(zoe).startInstance(installation, issuers, {
    namesByAddress,
  });
  produceInstance.resolve(instance);

  trace('postalSvc started');
};

export const manifest = /** @type {const} */ ({
  [startPostalSvc.name]: {
    consume: {
      agoricNames: true,
      namesByAddress: true,
      namesByAddressAdmin: true,
      zoe: true,
    },
    installation: {
      produce: { postalSvc: true },
    },
    instance: {
      produce: { postalSvc: true },
    },
  },
});

export const permit = JSON.stringify(Object.values(manifest)[0]);

// script completion value
startPostalSvc;
