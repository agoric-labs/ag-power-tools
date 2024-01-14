/**
 * @file contract to start other contracts (PROTOTYPE)
 *
 * An experiment in delegating the right to start new contracts
 * from the full set of stakers to something smaller.
 *
 * WARNING: anyone can start anything.
 *
 * TODO(#24): use governance framework; for example...
 *   - use a governed API (in the sense of @agoric/governance)
 *     for install, start
 *   - use a governed API for install
 *   - use a governed API for access to bootstrap powers
 *
 * ISSUE(#25):
 *   - adminFacet is NOT SAVED. UPGRADE IS IMPOSSIBLE
 */
// @ts-check

import { E, Far } from '@endo/far';
import { M, mustMatch } from '@endo/patterns';
import {
  InstallationShape,
  IssuerKeywordRecordShape,
} from '@agoric/zoe/src/typeGuards.js';
import { depositToSeat } from '@agoric/zoe/src/contractSupport/zoeHelpers.js';
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { atomicRearrange } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';
import { BOARD_AUX_PATH_SEGMENT, publish } from './boardAux.js';

/** @template SF @typedef {import('@agoric/zoe/src/zoeService/utils').StartParams<SF>} StartParams<SF> */

const { fromEntries, keys } = Object;
const { Fail } = assert;

/** @type {import('./types').ContractMeta} */
export const meta = harden({
  customTermsShape: {
    prices: {
      startInstance: AmountShape,
      installBundleID: AmountShape,
      storageNode: AmountShape,
      timerService: AmountShape,
      board: AmountShape,
      priceAuthority: AmountShape,
    },
    namesByAddress: M.remotable('namesByAddress'),
    agoricNames: M.remotable('agoricNames'),
  },
  privateArgsShape: {
    storageNode: M.remotable('storageNode'),
    timerService: M.remotable('timerService'),
    board: M.remotable('board'),
    priceAuthority: M.remotable('priceAuthority'),
  },
});
// subordinating these shapes under meta was added after zoe launched on mainnet
export const customTermsShape = meta.customTermsShape;
export const privateArgsShape = meta.privateArgsShape;

/**
 * @typedef {{
 *   namesByAddress: NameHub,
 *   agoricNames: NameHub,
 * }} PublicServices
 */

/**
 * @typedef {Record<keyof LimitedAccess
 *  | 'startInstance' | 'installBundleID', Amount<'nat'>>
 * } Prices
 */

/**
 * @typedef {{
 *   storageNode: StorageNode,
 *   timerService: unknown,
 *   board: import('@agoric/vats').Board,
 *   priceAuthority: unknown,
 * }} LimitedAccess
 */

/**
 * @see {ZoeService.startInstance}
 */
export const StartOptionsShape = M.and(
  M.or(
    M.splitRecord({ bundleID: M.string() }),
    M.splitRecord({ installation: InstallationShape }),
  ),
  M.partial({
    issuerKeywordRecord: IssuerKeywordRecordShape,
    customTerms: M.any(),
    privateArgs: M.any(),
    instanceLabel: M.string(),
    permit: M.partial({
      storageNode: BOARD_AUX_PATH_SEGMENT,
      timerService: true,
    }),
  }),
);

// TODO: generate types from shapes (IOU issue #)
/**
 * @template SF
 * @typedef {(
 *  { bundleID: string } | { installation: Installation<SF> }
 * ) & Partial<{
 *   issuerKeywordRecord: Record<string, Issuer>,
 *   customTerms: StartParams<SF>['terms'],
 *   privateArgs: StartParams<SF>['privateArgs'],
 *   instanceLabel: string,
 *   permit: Record<keyof LimitedAccess, string | true>,
 * }>} StartOptions
 */

const noHandler = () => Fail`no handler`;
const NoProposalShape = M.not(M.any());

const { add, makeEmpty } = AmountMath;
/** @param {Amount<'nat'>[]} xs */
const sum = xs =>
  xs.reduce((subtot, x) => add(subtot, x), makeEmpty(xs[0].brand));

/**
 * @param {ZCF<PublicServices & { prices: Prices }>} zcf
 * @param {LimitedAccess} limitedPowers
 * @param {unknown} _baggage
 */
export const start = (zcf, limitedPowers, _baggage) => {
  const { prices } = zcf.getTerms();
  const { storageNode, board } = limitedPowers;

  const zoe = zcf.getZoeService();
  const invitationIssuerP = E(zoe).getInvitationIssuer();
  // TODO(#26): let creator collect fees
  const { zcfSeat: fees } = zcf.makeEmptySeatKit();

  const pubMarshaller = E(board).getPublishingMarshaller();

  // NOTE: opts could be moved to offerArgs to
  // save one layer of closure, but
  // this way makes the types more discoverable via publicFacet

  /**
   * Make an invitation to to start a contract.
   * The payouts include an invitation whose details
   * include the resulting contract instance (and installation).
   * Since the smartWallet publishes the balance
   * of a user's invitation purse, this will
   * make the instance and installation visible in vstorage.
   *
   * @template {import('@agoric/zoe/src/zoeService/utils').ContractStartFunction} SF
   * @param {StartOptions<SF>} opts
   */
  const makeStartInvitation = async opts => {
    mustMatch(opts, StartOptionsShape);

    const Fee = sum([
      prices.startInstance,
      ...('installation' in opts ? [] : [prices.installBundleID]),
      ...keys(opts.permit || {}).map(k => prices[k]),
    ]);

    /** @param {ZCFSeat} seat */
    const handleStart = async seat => {
      atomicRearrange(zcf, harden([[seat, fees, { Fee }]]));
      const installation = await ('installation' in opts
        ? opts.installation
        : E(zoe).installBundleID(opts.bundleID));

      const { issuerKeywordRecord, customTerms, privateArgs, instanceLabel } =
        opts;
      const { storageNode: nodePermit, ...permit } = opts.permit || {};
      const powers = fromEntries(
        keys(permit || {}).map(k => [k, limitedPowers[k]]),
      );
      /** @type {StartedInstanceKit<SF>} */
      const it = await E(zoe).startInstance(
        installation,
        issuerKeywordRecord,
        customTerms,
        { ...privateArgs, ...powers },
        instanceLabel,
      );
      // WARNING: adminFacet is dropped
      const { instance, creatorFacet } = it;

      const itsTerms = await E(zoe).getTerms(instance);
      const itsId = await E(board).getId(instance);
      const itsNode = await E(storageNode).makeChildNode(itsId);
      await publish(
        itsNode,
        { terms: itsTerms, label: instanceLabel },
        pubMarshaller,
      );

      if (nodePermit) {
        const itsStorage = await E(itsNode).makeChildNode('info');
        // @ts-expect-error nodePermit implies this method
        await E(creatorFacet).initStorageNode(itsStorage);
      }

      const handlesInDetails = zcf.makeInvitation(
        noHandler,
        'started',
        { instance, installation },
        NoProposalShape,
      );
      const amt = await E(invitationIssuerP).getAmountOf(handlesInDetails);
      await depositToSeat(
        zcf,
        seat,
        { Started: amt },
        { Started: handlesInDetails },
      );
      seat.exit();
      return harden({ invitationMakers: creatorFacet });
    };
    return zcf.makeInvitation(handleStart, 'start');
  };

  const publicFacet = Far('PublicFacet', {
    makeStartInvitation,
  });

  return { publicFacet };
};
