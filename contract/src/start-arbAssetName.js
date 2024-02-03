// @ts-check
import { E } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';

/** @typedef {typeof import('./arbAssetNames.js').start} ContractFn */

/**
 * @param {BootstrapPowers} powers
 * @param {{ assetNamingOptions: {
 *   bundleID: string
 *   stable?: string
 *   price: number | bigint
 *   unit?: number | bigint
 * }}} config
 */
export const startArbAssetName = async (powers, config) => {
  const {
    consume: { zoe, board, agoricNamesAdmin },
    instance: {
      produce: { arbAssetName },
    },
    brand: { consume: brandConsume },
    issuer: { consume: issuerConsume },
  } = powers;
  const {
    assetNamingOptions: { bundleID, stable = 'IST', price, unit = 1n },
  } = config;
  /** @type {ERef<Installation<ContractFn>>} */
  const installation = E(zoe).installBundleID(bundleID);
  const issuers = { Price: await issuerConsume[stable] };
  const terms = {
    board: await board,
    price: AmountMath.make(
      await brandConsume[stable],
      BigInt(price) * BigInt(unit),
    ),
  };
  const privateArgs = {
    nameAdmins: {
      issuer: await E(agoricNamesAdmin).lookupAdmin('issuer'),
      brand: await E(agoricNamesAdmin).lookupAdmin('brand'),
    },
  };
  const startedKit = await E(zoe).startInstance(
    installation,
    issuers,
    terms,
    privateArgs,
  );
  arbAssetName.resolve(startedKit.instance);
};
