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

const MintOptsShape = M.splitRecord(
  { name: KeywordShape, supplyQty: M.bigint() },
  { assetKind: AssetKindShape, displayInfo: DisplayInfoShape },
);

const PoolProposalShape = harden({
  give: { Base: AmountShape },
  want: { Deposit: AmountShape },
  exit: {
    afterDeadline: { timer: TimerServiceShape, deadline: TimestampRecordShape },
  },
});

/** @type {import('./types').ContractMeta} */
export const meta = {
  privateArgsShape: { timerService: TimerServiceShape },
};

/**
 * Deposits are limited to fungible assets.
 *
 * TODO: charge for launching?
 *
 * @typedef {{
 *   timerBrand: unknown,
 * }} LaunchItTerms
 *
 * @typedef {{
 *   name: Keyword,
 *   supplyQty: bigint,
 *   assetKind?: AssetKind,
 *   displayInfo?: DisplayInfo,
 * }} MintOpts
 *
 * @typedef {{
 *   proposal: Proposal,
 *   seats: { creator: ZCFSeat, lockup: ZCFSeat, deposits: ZCFSeat }
 * }} PoolOpts
 *
 * @param {ZCF<LaunchItTerms>} zcf
 * @param {{ timerService: import('@agoric/time/src/types').TimerService }} privateArgs
 * @param {import('@agoric/vat-data').Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  // TODO: consider moving minting to separate contract
  // though... then we have the add issuer problem.

  /**
   * @param {ZCFSeat} seat
   * @param {MintOpts} opts
   * @throws if name is already used (ISSUE: how are folks supposed to know???)
   */
  const mintHandler = async (seat, opts) => {
    mustMatch(opts, MintOptsShape);
    const { name, supplyQty, assetKind = 'nat', displayInfo = {} } = opts;
    // TODO: charge for launching?
    const mint = await zcf.makeZCFMint(name, assetKind, displayInfo);
    const { brand } = await E(mint).getIssuerRecord();
    const supplyAmt = AmountMath.make(brand, supplyQty);
    mint.mintGains({ [name]: supplyAmt }, seat); // and throw away the mint
    // ISSUE: how does the brand get to the board so clients can make offers?
    // ISSUE: how can clients make offers if issuer is not in agoricNames?
    return name;
  };

  const { timerService } = privateArgs;
  const { timerBrand } = zcf.getTerms();
  const svcBrand = await E(timerService).getTimerBrand();
  timerBrand === svcBrand ||
    Fail`timerBrand of ${q(timerService)} must match ${q(timerBrand)}}`;

  const zone = makeDurableZone(baggage);
  const timestampShape = { timerBrand, absValue: TimestampValueShape };
  const pools = zone.mapStore('pools', {
    keyShape: M.nat(),
    // valueShape: poolOptsShape,
  });

  /** @type {OfferHandler} */
  const launchHandler = async creator => {
    const proposal = creator.getProposal();
    const { give, exit } = proposal;
    assert('afterDeadline' in exit, 'guaranteed by shape');
    // const { afterDeadline } = exit;
    const { zcfSeat: lockup } = zcf.makeEmptySeatKit();
    atomicRearrange(zcf, [[creator, lockup, give]]);
    const { zcfSeat: deposits } = zcf.makeEmptySeatKit();
    const key = pools.size();
    /** @type {PoolOpts} */
    const detail = { proposal, seats: { creator, lockup, deposits } };
    pools.init(key, detail);
    // const invitationMakers = { TODO: {} };
    return key;
  };

  const createSubscribeInvitation = poolKey => {
    /** @type {PoolOpts} */
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
    return zcf.makeInvitation(subscribeHandler, 'subscribe', {}, proposalShape);
  };

  return {
    publicFacet: Far('PF', {
      makeMintInvitation: () => zcf.makeInvitation(mintHandler, 'mint'),
      makeCreatePoolInvitation: () =>
        zcf.makeInvitation(
          launchHandler,
          'launch',
          undefined,
          PoolProposalShape,
        ),
      createSubscribeInvitation,
    }),
  };
};
