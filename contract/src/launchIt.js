// @ts-check
import { E, Far } from '@endo/far';
import { M, mustMatch } from '@endo/patterns';
import {
  BrandShape,
  AssetKindShape,
  DisplayInfoShape,
} from '@agoric/ertp/src/typeGuards.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import {
  TimerServiceShape,
  TimestampValueShape,
} from '@agoric/time/src/typeGuards.js';
import { makeDurableZone } from '@agoric/zone/durable.js';

const { Fail, quote: q } = assert;

const KeywordShape = M.string();

/** @type {import('./types').ContractMeta} */
export const meta = {
  privateArgsShape: { timerService: TimerServiceShape },
};

/**
 * @typedef {{
 *   timerBrand: unknown,
 * }} LaunchItTerms
 *
 * @typedef {{
 *   name: Keyword,
 *   supplyQty: bigint,
 *   assetKind?: AssetKind,
 *   displayInfo?: DisplayInfo,
 * }} PoolOpts
 *
 * @param {ZCF<LaunchItTerms>} zcf
 * @param {{ timerService: import('@agoric/time/src/types').TimerService }} privateArgs
 * @param {import('@agoric/vat-data').Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  const { timerService } = privateArgs;
  const { timerBrand } = zcf.getTerms();
  const svcBrand = await E(timerService).getTimerBrand();
  timerBrand === svcBrand ||
    Fail`timerBrand of ${q(timerService)} must match ${q(timerBrand)}}`;

  const zone = makeDurableZone(baggage);
  const optsShape = M.splitRecord(
    {
      name: KeywordShape,
      supplyQty: M.bigint(),
      deadline: { timerBrand, absValue: TimestampValueShape },
    },
    { assetKind: AssetKindShape, displayInfo: DisplayInfoShape },
  );
  const pools = zone.mapStore('pools', {
    keyShape: BrandShape,
    valueShape: optsShape,
  });

  const { zcfSeat: lockup } = zcf.makeEmptySeatKit();

  /**
   * @param {PoolOpts} opts
   *
   * @throws if name is already used (ISSUE: how are folks supposed to know???)
   */
  const createLaunchInvitation = opts => {
    mustMatch(opts, optsShape);
    const { name, supplyQty, assetKind = 'nat', displayInfo = {} } = opts;
    // const keyword = `KW${kwSerial}`;
    // kwSerial += 1n;

    /** @type {OfferHandler} */
    const launchHandler = async seat => {
      // TODO: charge for launching?
      const mint = await zcf.makeZCFMint(name, assetKind, displayInfo);
      const { brand } = await E(mint).getIssuerRecord();
      const supplyAmt = AmountMath.make(brand, supplyQty);
      mint.mintGains({ [name]: supplyAmt }, lockup); // and throw away the mint
      // ISSUE: how does the brand get to the board so clients can make offers?
      // ISSUE: how can clients make offers if issuer is not in agoricNames?
      pools.init(brand, opts);
      return name;
    };

    return zcf.makeInvitation(launchHandler, 'launch', opts);
  };

  /** @type {OfferHandler} */
  const contributeHandler = seat => {};

  const createContributeInvitation = () =>
    zcf.makeInvitation(contributeHandler, 'contribute');

  return {
    publicFacet: Far('PF', { createLaunchInvitation }),
  };
};
