// @ts-check
import { E, getInterfaceOf } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { allValues, mapValues, seatLike } from './wallet-tools.js';

const { entries, fromEntries, keys } = Object;
const { Fail } = assert;

/**
 * @typedef {{
 *   brand: Record<string, Promise<Brand>> & { timer: unknown }
 *   issuer: Record<string, Promise<Issuer>>
 *   instance: Record<string, Promise<Instance>>
 *   installation: Record<string, Promise<Installation>>
 * }} WellKnown
 */

/**
 * @typedef {{
 *   assetKind: Map<Brand, AssetKind>
 * }} WellKnownKinds
 */

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{ wallet: import('./wallet-tools.js').MockWallet }} mine
 * @param { WellKnown & WellKnownKinds } wellKnown
 * @param {{
 *   rxAddr: string,
 *   toSend: AmountKeywordRecord,
 *   svcInstance?: Instance,
 * }} shared
 */
export const payerPete = async (
  t,
  { wallet },
  wellKnown,
  { rxAddr, toSend, svcInstance },
) => {
  const instance = await (svcInstance || wellKnown.instance.postalSvc);

  t.log('Pete offers to send to', rxAddr, 'via contract', instance);
  const updates = await E(wallet.offers).executeOffer({
    id: 'peteSend1',
    invitationSpec: {
      source: 'contract',
      instance,
      publicInvitationMaker: 'makeSendInvitation',
      invitationArgs: [rxAddr],
    },
    proposal: { give: toSend },
  });

  for await (const update of updates) {
    // t.log('pete update', update);
    if (update?.status?.payouts) {
      for (const [kwd, amt] of Object.entries(update?.status?.payouts)) {
        const { brand } = amt;
        const kind =
          wellKnown.assetKind.get(brand) || Fail`no kind for brand ${kwd}`;
        t.log('Pete payout should be empty', amt);
        t.deepEqual(amt, AmountMath.makeEmpty(brand, kind));
      }
      t.is(update?.status?.numWantsSatisfied, 1);
      break;
    }
  }
};

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{ wallet: import('./wallet-tools.js').MockWallet, }} mine
 * @param {WellKnown & WellKnownKinds} wellKnown
 * @param {{ toSend: AmountKeywordRecord }} shared
 */
export const receiverRose = async (t, { wallet }, wellKnown, { toSend }) => {
  const { makeEmpty } = AmountMath;
  const purseNotifier = await allValues(
    mapValues(toSend, amt => E(wallet.peek).purseNotifier(amt.brand)),
  );

  const initial = await allValues(
    mapValues(purseNotifier, pn => E(pn).getUpdateSince()),
  );
  for (const [name, update] of Object.entries(initial)) {
    t.log('Rose', name, 'purse starts emtpy', update.value);
    const brand = toSend[name].brand;
    const kind = wellKnown.assetKind.get(brand) || Fail`${brand}`;
    t.deepEqual(update.value, makeEmpty(brand, kind));
  }

  const done = await allValues(
    Object.fromEntries(
      Object.entries(initial).map(([name, update]) => {
        const amtP = E(purseNotifier[name])
          .getUpdateSince(update.updateCount)
          .then(u => {
            t.log('Rose rxd', u.value);
            t.deepEqual(u.value, toSend[name]);
            return u.value;
          });
        return [name, amtP];
      }),
    ),
  );
  t.log('Rose got balance updates', Object.keys(done));
  t.deepEqual(Object.keys(done), Object.keys(toSend));
};

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{ wallet: import('./wallet-tools.js').MockWallet, }} mine
 * @param {{ toSend: AmountKeywordRecord }} shared
 */
export const receiverRex = async (t, { wallet }, { toSend }) => {
  const purseNotifier = await allValues(
    mapValues(toSend, amt => E(wallet.peek).purseNotifier(amt.brand)),
  );

  const initial = await allValues(
    mapValues(purseNotifier, pn => E(pn).getUpdateSince()),
  );

  const done = await allValues(
    fromEntries(
      entries(initial).map(([name, update]) => {
        const amtP = E(purseNotifier[name])
          .getUpdateSince(update.updateCount)
          .then(u => {
            t.log('Rex rxd', u.value);
            t.deepEqual(u.value, toSend[name]);
            return u.value;
          });
        return [name, amtP];
      }),
    ),
  );
  t.log('Rex got balance updates', keys(done));
  t.deepEqual(keys(done), keys(toSend));
};

export const senderContract = async (
  t,
  { zoe, terms: { postalSvc: instance, destAddr: addr1 } },
) => {
  const iIssuer = await E(zoe).getInvitationIssuer();
  const iBrand = await E(iIssuer).getBrand();
  const postalSvc = E(zoe).getPublicFacet(instance);
  const purse = await E(iIssuer).makeEmptyPurse();

  const noInvitations = AmountMath.make(iBrand, harden([]));
  const pmt1 = await E(purse).withdraw(noInvitations);

  t.log(
    'senderContract: E(',
    getInterfaceOf(await postalSvc),
    ').sendTo(',
    addr1,
    ',',
    noInvitations,
    ')',
  );
  const sent = await E(postalSvc).sendTo(addr1, pmt1);
  t.deepEqual(sent, noInvitations);
};

/**
 * Auxiliary data
 * @typedef {{
 *   boardAux: (obj: unknown) => Promise<any>
 * }} BoardAux
 */

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{
 *   wallet: import('./wallet-tools.js').MockWallet,
 * }} mine
 * @param { WellKnown & BoardAux} wellKnown
 */
export const starterSam = async (t, mine, wellKnown) => {
  const { wallet } = mine;

  const checkKeys = (label, actual, expected) => {
    label && t.log(label, actual);
    t.deepEqual(keys(actual), keys(expected));
  };
  const first = array => {
    t.true(Array.isArray(array));
    t.is(array.length, 1);
    const [it] = array;
    return it;
  };
  const brand = {
    Invitation: await wellKnown.brand.Invitation,
  };
  const instance = {
    contractStarter: await wellKnown.instance.contractStarter,
  };

  const expected = {
    result: 'UNPUBLISHED',
    payouts: {
      Fee: { brand: brand.IST, value: 0n },
      Handles: {
        brand: brand.Invitation,
        value: [
          {
            customDetails: {
              installation: true,
              instance: true,
            },
            description: true,
            handle: true,
            installation: true,
            instance: instance.contractStarter,
          },
        ],
      },
    },
  };

  let offerSeq = 0;
  /** @param {{ bundleID: string, label?: string}} opts */
  const install = async opts => {
    const starterAux = await wellKnown.boardAux(instance.contractStarter);
    const { installBundleID } = starterAux.terms.prices;
    t.log('sam gives', installBundleID, 'to install', opts.label);
    const updates = await E(wallet.offers).executeOffer({
      id: `install-${(offerSeq += 1)}`,
      invitationSpec: {
        source: 'contract',
        instance: instance.contractStarter,
        publicInvitationMaker: 'makeInstallInvitation',
      },
      proposal: { give: { Fee: installBundleID } },
      offerArgs: opts,
    });
    const payouts = await E(seatLike(updates)).getPayouts();
    t.log('sam install paid', payouts);
    const {
      value: [
        {
          customDetails: { installation },
        },
      ],
    } = payouts.Handles;
    return installation;
  };

  const getPostalSvcTerms = async () => {
    const {
      terms: { namesByAddress },
    } = await wellKnown.boardAux(instance.contractStarter);
    t.log('Sam got namesByAddress from contractStarter terms', namesByAddress);
    return { namesByAddress };
  };

  /**
   * @template SF
   * @param {import('../src/contractStarter.js').StartOptions<SF>} opts
   */
  const installAndStart = async opts => {
    t.log(
      'Sam starts',
      opts.instanceLabel,
      'from',
      (opts.bundleID || '').slice(0, 8),
    );
    const starterAux = await wellKnown.boardAux(instance.contractStarter);
    const { startInstance } = starterAux.terms.prices;
    const updates = await E(wallet.offers).executeOffer({
      id: `samStart-${(offerSeq += 1)}`,
      invitationSpec: {
        source: 'contract',
        instance: instance.contractStarter,
        publicInvitationMaker: 'makeStartInvitation',
        invitationArgs: [opts],
      },
      proposal: { give: { Fee: startInstance } },
    });

    const seat = seatLike(updates);

    const result = await E(seat).getOfferResult();
    t.log('Sam gets result', result);
    t.is(result, expected.result);

    const payouts = await E(seat).getPayouts();
    checkKeys(undefined, payouts, expected.payouts);
    const { Handles } = payouts;
    t.is(Handles.brand, expected.payouts.Handles.brand);
    const details = first(Handles.value);
    const [details0] = expected.payouts.Handles.value;
    checkKeys(undefined, details, details0);
    t.is(details.instance, details0.instance);
    checkKeys(
      'Sam gets instance etc.',
      details.customDetails,
      details0.customDetails,
    );

    return details.customDetails;
  };

  return { install, getPostalSvcTerms, installAndStart };
};

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{
 *   wallet: import('./wallet-tools.js').MockWallet
 * }} mine
 * @param {*} wellKnown
 */
export const launcherLarry = async (t, { wallet }, wellKnown) => {
  const { timerService: timer } = wellKnown;
  const timerBrand = await wellKnown.brand.timer;
  const MNY = {
    brand: await wellKnown.brand.MNY,
    issuer: await wellKnown.issuer.MNY,
  };

  const instance = {
    contractStarter: await wellKnown.instance.contractStarter,
  };

  let offerSeq = 0;
  let launchOfferId;
  const deadline = harden({ timerBrand, absValue: 10n });

  const launch = async (
    installation,
    customTerms = { name: 'BRD', supplyQty: 1_000_000n },
  ) => {
    !launchOfferId || Fail`already launched`;

    t.log('Larry prepares to launch', customTerms, 'at', deadline);
    const { name } = customTerms;
    const starterAux = await wellKnown.boardAux(instance.contractStarter);
    const { startInstance } = starterAux.terms.prices;

    const startOpts = {
      instanceLabel: `${name}-launch`,
      installation,
      issuerKeywordRecord: { Deposit: MNY.issuer },
      customTerms: { ...customTerms, deadline },
    };
    /** @type {import('@agoric/smart-wallet').OfferSpec} */

    const id = `launch-${(offerSeq += 1)}`;
    t.log('Larry pays', startInstance, 'to start', startOpts.label);
    const updates = await E(wallet.offers).executeOffer({
      id,
      invitationSpec: {
        source: 'contract',
        instance: instance.contractStarter,
        publicInvitationMaker: 'makeStartInvitation',
        invitationArgs: [startOpts],
      },
      proposal: {
        give: { Fee: startInstance },
      },
    });

    const seat = seatLike(updates);
    const result = await E(seat).getOfferResult();
    t.log('larry launch result', result);
    const { Handles } = await E(seat).getPayouts();
    const { instance: launched } = Handles.value[0].customDetails;
    t.log('larry launch instance', launched);
    launchOfferId = id;

    return launched;
  };

  const collect = async () => {
    t.log('Larry collects at', deadline);
    const id = `collect-${(offerSeq += 1)}`;
    const up2 = await E(wallet.offers).executeOffer({
      id,
      invitationSpec: {
        source: 'continuing',
        previousOffer: launchOfferId,
        invitationMakerName: 'Collect',
      },
      proposal: {
        want: { Deposit: AmountMath.make(MNY.brand, 0n) },
        exit: { afterDeadline: { timer, deadline } },
      },
    });
    const seat = seatLike(up2);
    const result = await E(seat).getOfferResult();
    t.log('result', result);
    const proceeds = await E(seat).getPayouts();
    t.log('Larry collected', proceeds);
  };
  return { launch, collect };
};

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{
 *   wallet: import('./wallet-tools.js').MockWallet,
 *   ix: number,
 *   qty: bigint,
 * }} mine
 * @param {*} wk
 */
export const makeFan = (t, { wallet, ix, qty }, wk) => {
  let offerSeq = 0;
  const deposit = async instance => {
    const { terms } = await wk.boardAux(instance);
    const { brands, issuers } = terms;
    // t.log(ix, 'fan found brands', brands);

    await E(wallet.offers).addIssuer(issuers.Share);
    await E(wallet.offers).addIssuer(issuers.BRD);

    const updates = await E(wallet.offers).executeOffer({
      id: `deposit-${(offerSeq += 1)}`,
      invitationSpec: {
        source: 'contract',
        instance,
        publicInvitationMaker: 'makeDepositInvitation',
      },
      proposal: {
        give: { Deposit: AmountMath.make(brands.Deposit, qty) },
        want: { Shares: AmountMath.make(brands.Share, qty) },
      },
    });
    const seat = seatLike(updates);
    const payouts = await E(seat).getPayouts();
    t.log(ix, 'fan got', payouts.Shares);
    return payouts.Shares;
  };

  const redeem = async instance => {
    const { terms } = await wk.boardAux(instance);
    const { brands } = terms;

    const updates = await E(wallet.offers).executeOffer({
      id: `redeem-${(offerSeq += 1)}`,
      invitationSpec: {
        source: 'contract',
        instance,
        publicInvitationMaker: 'makeRedeemInvitation',
      },
      proposal: {
        give: { Shares: AmountMath.make(brands.Share, qty) },
        want: { Minted: AmountMath.make(brands.BRD, 1n) },
      },
    });
    const seat = seatLike(updates);
    const payouts = await E(seat).getPayouts();
    t.log(ix, 'fan got', payouts.Minted);
    return payouts.Minted;
  };

  return { deposit, redeem };
};
