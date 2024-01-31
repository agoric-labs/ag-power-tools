// @ts-check
import { Far } from '@endo/far';
import { M, mustMatch } from '@endo/patterns';
import { BrandShape, DisplayInfoShape } from '@agoric/ertp/src/typeGuards.js';
import { AmountMath, AssetKind } from '@agoric/ertp/src/amountMath.js';
import {
  TimerServiceShape,
  TimestampRecordShape,
  TimestampShape,
} from '@agoric/time/src/typeGuards.js';
import { atomicRearrange } from '@agoric/zoe/src/contractSupport/index.js';
import {
  floorMultiplyBy,
  makeRatio,
} from '@agoric/zoe/src/contractSupport/ratio';

const { Fail } = assert;

/** @type {import('./types').ContractMeta} */
export const meta = {
  customTermsShape: M.splitRecord(
    { name: M.string(), supplyQty: M.bigint(), deadline: TimestampShape },
    { displayInfo: DisplayInfoShape },
  ),
};
export const { customTermsShape } = meta;
/**
 * @typedef {{
 *   name: string,
 *   supplyQty: bigint,
 *   deadline: import('@agoric/time/src/types').TimestampRecord,
 *   displayInfo?: DisplayInfo,
 * }} LaunchTerms
 */

const kw = s => (/^[A-Z]/.test(s) ? s : `KW${s}`); // only addresses initial cap

/**
 * @param {ZCF} zcf
 * @param {string} kw
 */
const makeZcfIssuerKit = async (zcf, kw) => {
  const mint = await zcf.makeZCFMint(kw);
  const kit = mint.getIssuerRecord();
  return { ...kit, mint };
};

/**
 * This contract is limited to fungible assets.
 *
 * @param {ZCF<LaunchTerms>} zcf
 * @param {unknown} _privateArgs
 * @param {import('@agoric/vat-data').Baggage} _baggage
 */
export const start = async (zcf, _privateArgs, _baggage) => {
  const {
    name,
    supplyQty,
    deadline,
    displayInfo = {},
    brands,
  } = zcf.getTerms();
  mustMatch(brands, M.splitRecord({ Deposit: BrandShape }));
  const { zcfSeat: deposits } = zcf.makeEmptySeatKit();

  const assetMint = await zcf.makeZCFMint(kw(name), AssetKind.NAT, displayInfo);
  const asset = assetMint.getIssuerRecord();
  const share = await makeZcfIssuerKit(zcf, 'Share');

  const ShapeAmt = {
    Asset: harden({ brand: asset.brand, value: M.nat() }),
    Deposit: harden({ brand: brands.Deposit, value: M.nat() }),
    Share: harden({ brand: share.brand, value: M.nat() }),
  };
  const ExitDeadlineShape = {
    afterDeadline: {
      timer: TimerServiceShape,
      deadline: TimestampRecordShape,
    },
  };
  // export these from a client interface module?
  const Shape = harden({
    Amount: ShapeAmt,
    Proposal: {
      Collect: M.splitRecord(
        { exit: ExitDeadlineShape },
        { want: { Deposit: ShapeAmt.Deposit } },
      ),
      Deposit: M.splitRecord(
        { give: { Deposit: ShapeAmt.Deposit } },
        { want: { Shares: ShapeAmt.Share } },
      ),
      Withdraw: M.splitRecord({
        want: { Deposit: ShapeAmt.Deposit },
        give: { Shares: ShapeAmt.Share },
      }),
      Redeem: M.splitRecord(
        { give: { Shares: ShapeAmt.Share } },
        { want: { Minted: ShapeAmt.Asset } },
      ),
    },
  });

  const Minted = AmountMath.make(asset.brand, supplyQty);

  /**
   * @typedef {{ tag: 'start'}
   *   | { tag: 'committed', totalShares: Amount<'nat'>
   * }} LaunchState
   *
   * ISSUE: require collect offer before accepting deposits?
   */
  /** @type {LaunchState} */
  let state = { tag: 'start' };
  const getTotalShares = () => {
    if (state.tag !== 'committed') throw Fail`launch not committed`;
    return state.totalShares;
  };

  const { zcfSeat: stage } = zcf.makeEmptySeatKit();
  const mintShares = value => {
    state.tag !== 'committed' || Fail`too late to deposit`;
    const Shares = AmountMath.make(share.brand, value);
    stage.clear(); // Deprecated but not @deprecated
    share.mint.mintGains({ Shares }, stage);
    return Shares;
  };

  /** @type {OfferHandler} */
  const depositHandler = subscriber => {
    const { give } = subscriber.getProposal();
    const { Deposit } = give;
    const Shares = mintShares(Deposit.value);
    atomicRearrange(
      zcf,
      harden([
        [subscriber, deposits, give],
        [stage, subscriber, { Shares }],
      ]),
    );
    subscriber.exit();
    return true;
  };

  /** @type {OfferHandler} */
  const withdrawHandler = subscriber => {
    state.tag !== 'committed' || Fail`past deadline to withdraw`;
    const { want, give } = subscriber.getProposal();
    const { Shares } = give;
    const { Deposit } = want;
    mustMatch(Shares.value, M.gte(Deposit.value), 'insufficient shares');
    atomicRearrange(zcf, harden([[deposits, subscriber, { Deposit }]]));
    share.mint.burnLosses({ Shares }, subscriber);
    subscriber.exit();
    return true;
  };

  const { zcfSeat: lockup } = zcf.makeEmptySeatKit();
  assetMint.mintGains({ Minted }, lockup);

  /** @param {ZCFSeat} subscriber */
  const redeemHandler = subscriber => {
    const denom = getTotalShares();
    const { give } = subscriber.getProposal();
    const { Shares } = give;
    const gains = floorMultiplyBy(
      Minted,
      makeRatio(Shares.value, Minted.brand, denom.value, Minted.brand),
    );
    atomicRearrange(zcf, harden([[lockup, subscriber, { Minted: gains }]]));
    share.mint.burnLosses({ Shares }, subscriber);
    subscriber.exit();
    return true;
  };

  const publicFacet = Far('launchItPublic', {
    makeDepositInvitation: () =>
      zcf.makeInvitation(
        depositHandler,
        'deposit',
        undefined,
        Shape.Proposal.Deposit,
      ),
    makeWithrawInvitation: () =>
      zcf.makeInvitation(
        withdrawHandler,
        'withdraw',
        undefined,
        Shape.Proposal.Withdraw,
      ),
    makeRedeemInvitation: () =>
      zcf.makeInvitation(
        redeemHandler,
        'redeem',
        undefined,
        Shape.Proposal.Redeem,
      ),
  });

  /** @param {ZCFSeat} creator */
  const collectHandler = async creator => {
    const { exit } = creator.getProposal();
    mustMatch(
      'afterDeadline' in exit && exit.afterDeadline.deadline,
      M.gte(deadline),
      'must collect after deadline from terms',
    );
    const gains = deposits.getAmountAllocated('Deposit', brands.Deposit);
    const Shares = AmountMath.make(share.brand, gains.value);
    atomicRearrange(zcf, harden([[deposits, creator, { Deposit: gains }]]));
    state = { tag: 'committed', totalShares: Shares };
    return state.totalShares.value; // walletFactory passes primitives thru
  };

  const creatorFacet = Far('launchItCreator', {
    Collect: () =>
      zcf.makeInvitation(
        collectHandler,
        'Collect',
        undefined,
        Shape.Proposal.Collect,
      ),
  });

  return { publicFacet, creatorFacet };
};
