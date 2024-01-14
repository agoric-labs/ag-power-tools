// @ts-check
import { E, getInterfaceOf } from '@endo/far';
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
 *   bundleID: string,
 * }} mine
 * @param { WellKnown & BoardAux} wellKnown
 */
export const starterSam = async (t, mine, wellKnown) => {
  const { wallet, bundleID } = mine;
  const brand = {
    Invitation: await wellKnown.brand.Invitation,
  };
  const instance = {
    contractStarter: await wellKnown.instance.contractStarter,
  };

  const {
    terms: { namesByAddress },
  } = await wellKnown.boardAux(instance.contractStarter);
  t.log('Sam got namesByAddress from contractStarter terms', namesByAddress);
  const customTerms = { namesByAddress };
  t.log('Sam starts postalSvc from bundle', bundleID.slice(0, 8));
  const updates = await E(wallet.offers).executeOffer({
    id: 'samStart-1',
    invitationSpec: {
      source: 'contract',
      instance: instance.contractStarter,
      publicInvitationMaker: 'makeStartInvitation',
      invitationArgs: [{ bundleID, customTerms }],
    },
  });

  const expected = {
    result: 'UNPUBLISHED',
    payouts: {
      Started: {
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

  const seat = seatLike(updates);

  const result = await E(seat).getOfferResult();
  checkKeys('Sam gets creatorFacet', result, expected.result);

  const payouts = await E(seat).getPayouts();
  checkKeys(undefined, payouts, expected.payouts);
  const { Started } = payouts;
  t.is(Started.brand, expected.payouts.Started.brand);
  const details = first(Started.value);
  const [details0] = expected.payouts.Started.value;
  checkKeys(undefined, details, details0);
  t.is(details.instance, details0.instance);
  checkKeys(
    'Sam gets instance etc.',
    details.customDetails,
    details0.customDetails,
  );

  return details.customDetails;
};
