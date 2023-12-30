// @ts-check
import { AssetKind, makeIssuerKit } from '@agoric/ertp';
import { M, prepareExoClass } from '@agoric/vat-data';

/**
 * @typedef {{
 *  tokenKeyword: string;
 *  tokenDecimals: number;
 *  proposedName: string;
 *  denom: string;
 * }} IBCTokenTerms
 */

export const meta = {
  customTermsShape: {
    tokenKeyword: M.string(),
    tokenDecimals: M.number(),
    proposedName: M.string(),
    denom: M.string(),
  },
};
harden(meta);

export const IBCTokenCreatorFacetIKit = harden(
  M.interface('IBCTokenCreatorFacetKit', {
    // XXX refactor M.any()
    getTokenMint: M.call().returns(M.any()),
    getTokenIssuer: M.call().returns(M.any()),
    getTokenBrand: M.call().returns(M.any()),
    getTokenKit: M.call().returns(M.any()),
  }),
);

/**
 * @param {ZCF<IBCTokenTerms>} zcf
 * @param {Record<string, unknown>} _privateArgs
 * @param {import('@agoric/vat-data').Baggage} baggage
 */
export const prepare = async (zcf, _privateArgs, baggage) => {
  const { tokenKeyword, tokenDecimals } = zcf.getTerms();

  const makeCreatorFacet = prepareExoClass(
    baggage,
    'IBCTokenCreatorFacet',
    IBCTokenCreatorFacetIKit,
    () => ({}),
    {
      getTokenMint: () => mint,
      getTokenIssuer: () => issuer,
      getTokenBrand: () => brand,
      getTokenKit: () => harden({ brand, issuer, mint }),
    },
    harden({
      stateShape: {},
    }),
  );

  // XXX do we need to use baggage? seems like makeIssuerKit is already durable
  const { brand, issuer, mint } = makeIssuerKit(tokenKeyword, AssetKind.NAT, {
    decimalPlaces: tokenDecimals || 6,
  });

  return harden({
    creatorFacet: makeCreatorFacet(),
  });
};

harden(prepare);
