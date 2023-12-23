// @ts-check

import { E } from '@endo/far';

const { entries, fromEntries } = Object;

const { Fail } = assert;

export const contractName = 'vstoreShop';

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
const allValues = async obj => {
  const es = await Promise.all(
    entries(obj).map(async ([k, v]) => [k, await v]),
  );
  return fromEntries(es);
};

// XXX avoid linking
const AmountMath = { make: (brand, value) => harden({ brand, value }) };

/**
 * @param {Brand} brand
 * @param {number} n
 * @param {number} decimalPlaces
 */
const units = (brand, n, decimalPlaces) =>
  AmountMath.make(brand, BigInt(Math.round(n * 10 ** decimalPlaces)));

/**
 * @param {import('@agoric/vats').BootstrapPowers} powers
 * @param {{ options?: { vstoreShop?: { bundleID?: string, priceUnits }}}} [config]
 */
export const startVstoreShop = async (powers, config = {}) => {
  console.log('startVstoreShop() ...');
  const { bundleID = Fail`missing bundleID`, priceUnits = 50 } =
    config.options?.vstoreShop || {};
  const {
    consume: { zoe, chainStorage },
    issuer: {
      consume: { IST: istIssuerP },
    },
    brand: {
      consume: { IST: istBrandP },
    },
    installation: {
      produce: { [contractName]: produceInstallation },
    },
    instance: {
      produce: { [contractName]: produceInstance },
    },
  } = powers;

  /** @type {Installation<import('../src/vstoreShop.js').start>} */
  const installation = await E(zoe).installBundleID(bundleID);

  const { storageNode, istIssuer } = await allValues({
    storageNode: E(chainStorage).makeChildNode(contractName),
    istIssuer: istIssuerP,
  });
  console.log(contractName, { installation, storageNode });

  const {
    istBrand,
    displayInfo: { decimalPlaces },
  } = await allValues({
    istBrand: istBrandP,
    displayInfo: E(istBrandP).getDisplayInfo(),
  });

  produceInstallation.resolve(installation);

  const started = await E(zoe).startInstance(
    installation,
    { Payment: istIssuer },
    { basePrice: units(istBrand, priceUnits, decimalPlaces) },
    { storageNode },
  );
  produceInstance.resolve(started.instance);
  console.log(contractName, started);
};

export const permit = {
  consume: { zoe: true, chainStorage: true },
  issuer: {
    consume: { IST: true },
  },
  brand: {
    consume: { IST: true },
  },
  installation: {
    produce: { [contractName]: true },
  },
  instance: {
    produce: { [contractName]: true },
  },
};
