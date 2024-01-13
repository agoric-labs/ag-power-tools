/**
 * @file core eval script* to start the postalSvc contract.
 *
 * * see test-gimix-proposal.js to make a script from this file.
 *
 * The `permit` export specifies the corresponding permit.
 */
// @ts-check

import { E, Far } from '@endo/far';

const { Fail } = assert;

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
 * ref https://github.com/Agoric/agoric-sdk/issues/8408#issuecomment-1741445458
 *
 * @param {ERef<import('@agoric/vats').NameAdmin>} namesByAddressAdmin
 */
const fixHub = async namesByAddressAdmin => {
  /** @type {import('@agoric/vats').NameHub} */
  const hub = Far('Hub work-around', {
    lookup: async (addr, ...rest) => {
      await E(namesByAddressAdmin).reserve(addr);
      const addressAdmin = await E(namesByAddressAdmin).lookupAdmin(addr);
      assert(addressAdmin, 'no admin???');
      const addressHub = E(addressAdmin).readonly();
      if (rest.length === 0) return addressHub;
      await E(addressAdmin).reserve(rest[0]);
      return E(addressHub).lookup(...rest);
    },
    has: _key => Fail`key space not well defined`,
    entries: () => Fail`enumeration not supported`,
    values: () => Fail`enumeration not supported`,
    keys: () => Fail`enumeration not supported`,
  });
  return hub;
};

/**
 * @param {BootstrapPowers & PostalSvcPowers} powers
 * @param {{ options?: { postalSvc: {
 *   bundleID: string;
 *   issuerNames?: string[];
 * }}}} config
 */
export const startPostalSvc = async (powers, config) => {
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
