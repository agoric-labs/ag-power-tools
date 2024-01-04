// @ts-check
import { E, Far } from '@endo/far';
import { M, mustMatch } from '@endo/patterns';
import {
  BrandShape,
  AmountShape,
  AssetKindShape,
  DisplayInfoShape,
} from '@agoric/ertp/src/typeGuards.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import {
  TimerServiceShape,
  TimestampRecordShape,
  TimestampValueShape,
} from '@agoric/time/src/typeGuards.js';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { atomicRearrange } from '@agoric/zoe/src/contractSupport/index.js';

const { Fail, quote: q } = assert;

const KeywordShape = M.string();

/**
 * @typedef {{
 *   name: Keyword,
 *   assetKind?: AssetKind,
 *   displayInfo?: DisplayInfo,
 * }} LaunchOpts
 */
const LaunchOptShape = M.splitRecord(
  { name: KeywordShape, supplyQty: M.bigint() },
  { assetKind: AssetKindShape, displayInfo: DisplayInfoShape },
);

const LaunchProposalShape = harden({
  give: {},
  want: { Deposit: AmountShape },
  exit: {
    afterDeadline: { timer: TimerServiceShape, deadline: TimestampRecordShape },
  },
});

/**
 * This contract is limited to fungible assets.
 *
 * TODO: charge for launching?
 *
 * @param {ZCF} zcf
 * @param {unknown} _privateArgs
 * @param {import('@agoric/vat-data').Baggage} baggage
 */
export const start = async (zcf, _privateArgs, baggage) => {
  // TODO: consider moving minting to separate contract
  // though... then we have the add issuer problem.

  /**
   * @typedef {{
   *   proposal: Proposal,
   *   mint: ZCFMint,
   *   seats: { creator: ZCFSeat, lockup: ZCFSeat, deposits: ZCFSeat },
   * }} PoolDetail
   *
   */

  /**
   * @param {ZCFSeat} creator
   * @param {LaunchOpts} opts
   * @throws if name is already used (ISSUE: how are folks supposed to know???)
   */
  const launchHandler = async (creator, opts) => {
    mustMatch(opts, LaunchOptShape);
    const { name, assetKind = 'nat', displayInfo = {} } = opts;

    const proposal = creator.getProposal();

    // TODO: charge for launching?
    const mint = await zcf.makeZCFMint(name, assetKind, displayInfo);

    const { zcfSeat: lockup } = zcf.makeEmptySeatKit();
    const { zcfSeat: deposits } = zcf.makeEmptySeatKit();

    /** @type {PoolDetail} */
    const detail = harden({
      proposal,
      mint,
      seats: { creator, lockup, deposits },
    });
    const key = pools.getSize();
    pools.init(key, detail);
    // const invitationMakers = { TODO: {} };
    // ISSUE: how does the brand get to the board so clients can make offers?
    // ISSUE: how can clients make offers if issuer is not in agoricNames?
    return key;
  };

  const zone = makeDurableZone(baggage);
  const pools = zone.mapStore('pools', {
    keyShape: M.number(),
    // valueShape: PoolDetailShape,
  });

  const makeSubscribeInvitation = poolKey => {
    /** @type {PoolDetail} */
    const pool = pools.get(poolKey);
    const { deposits } = pool.seats;

    /** @type {OfferHandler} */
    const subscribeHandler = subscriber => {
      const { give } = subscriber.getProposal();
      atomicRearrange(zcf, [[subscriber, deposits, give]]);
    };

    const { Deposit } = pool.proposal.want;
    const proposalShape = harden({
      give: { Deposit: { brand: Deposit.brand, value: M.nat() } },
    });
    return zcf.makeInvitation(
      subscribeHandler,
      'subscribe',
      undefined,
      proposalShape,
    );
  };

  return {
    publicFacet: Far('PF', {
      makeLaunchInvitation: () =>
        zcf.makeInvitation(
          launchHandler,
          'launch',
          undefined,
          LaunchProposalShape,
        ),
      makeSubscribeInvitation,
    }),
  };
};
