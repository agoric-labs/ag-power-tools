/**
 * @file Prototype Decentralized Asset Naming
 * @see {start}
 */
// @ts-check
import { E, Far } from '@endo/far';
import { M, mustMatch } from '@endo/patterns';
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';
import { atomicRearrange } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';

const { Fail, quote: q } = assert;

const AssetInfoShape = harden({
  issuer: M.remotable('Issuer'),
  brand: M.remotable('Brand'),
});

const PublishProposalShape = {
  give: { Pay: AmountShape },
  want: {},
  exit: M.any(),
};

/** @type {import("./types").ContractMeta} */
const meta = {
  privateArgsShape: {
    nameAdmins: { issuer: M.remotable(), brand: M.remotable() },
  },
};

/**
 *
 * @typedef {{
 *   board: import('@agoric/vats/src/types').Board,
 *   price: Amount,
 * }} BoardTerms
 * @param {ZCF<BoardTerms>} zcf
 * @param {{ nameAdmins: {
 *   issuer: import('@agoric/vats/src/types').NameAdmin,
 *   brand: import('@agoric/vats/src/types').NameAdmin
 * }}} privateArgs
 * @param {*} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  const { board, price } = zcf.getTerms();
  const { nameAdmins } = privateArgs;

  /**
   * @param {Issuer} issuer
   * @param {Brand} brand
   */
  const prepare = async (issuer, brand) => {
    mustMatch(harden({ issuer, brand }), AssetInfoShape);
    // Check: issuer and brand recognize each other
    const issuerBrand = await E(issuer).getBrand();
    issuerBrand === brand ||
      Fail`issuer ${q(issuer)}'s brand is ${q(issuerBrand)} not ${q(brand)}`;
    const issuerOk = await E(brand).isMyIssuer(issuer);
    issuerOk || Fail`brand ${q(brand)} does not recognize ${q(issuer)}`;

    // Check: issuer makes purses with the same brand
    const aPurse = await E(issuer).makeEmptyPurse();
    const purseBrand = await E(aPurse).getAllegedBrand();
    purseBrand === brand ||
      Fail`issuer ${q(issuer)}'s purse's brand is ${q(purseBrand)} not ${q(
        brand,
      )}`;
  };

  /**
   * @param {Issuer} issuer
   * @param {Brand} brand
   */
  const commit = async (issuer, brand) => {
    const name = await E(board).getId(brand);
    await Promise.all([
      E(nameAdmins.issuer).update(name, issuer),
      E(nameAdmins.brand).update(name, brand),
    ]);
    return name;
  };

  const { zcfSeat: proceeds } = zcf.makeEmptySeatKit();
  const publishHandler = async (seat, offerArgs) => {
    mustMatch(harden(offerArgs), AssetInfoShape);
    atomicRearrange(zcf, [[seat, proceeds, { Pay: price }]]);
    const { issuer, brand } = offerArgs;
    await prepare(issuer, brand);
    const name = await commit(issuer, brand);
    return name;
  };
  const makePublishAssetInvitation = () =>
    zcf.makeInvitation(publishHandler, 'publishAsset', PublishProposalShape);
  const publicFacet = Far('Arb Asset Naming', { makePublishAssetInvitation });
  return { publicFacet };
};
