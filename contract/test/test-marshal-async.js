/**
 * Marshal using petnames and generated IDs as slots.
 *
 * TODO: to to reverse-lookup in a hierarchy of names?
 * how about in a combination of name hierarchy and generated names?
 *
 * If board123 and my.brand.MNY refer to the same brand,
 * the on-chain side will know. But clients can only
 * synthesize the same remotable if they are given the same slot.
 *
 * TODO: how to ensure that we don't serialize sensitive info
 * such as offer results?
 */

// @ts-check
import test from 'ava';
import { makeMarshal } from '@endo/marshal';
import { zip } from '../src/objectTools';

const passThru = makeMarshal(undefined, undefined, {
  serializeBodyFormat: 'smallcaps',
});

/**
 * Either a chosen petname path or generated board ID
 *
 * @typedef { BoardID | DottedPath } PetSlot
 * @typedef {`.${string}`} DottedPath
 * @typedef {`b${string}`} BoardID
 */

/** @param {string} s */
const isPet = s => s.startsWith('.');

/**
 * @param {import('@endo/marshal').CapData<PetSlot>} capData
 * @param {(...path: string[]) => ERef<any>} lookup
 */
const parse = async ({ body, slots }, lookup) => {
  const valueSlots = await Promise.all(slots.map(ps => lookup(ps)));
  return passThru.fromCapData(harden({ body, slots: valueSlots }));
};

/**
 * @param {import('@endo/pass-style').Passable} specimen
 * @param {(k: import('@endo/patterns').Key) =>  BoardID} provideName
 */
const format = async (specimen, provideName) => {
  const { body, slots: valueSlots } = passThru.toCapData(specimen);
  const slots = await Promise.all(
    // NEEDSTEST: this presumes we get values via lookup
    // before we format them
    valueSlots.map(val => provideName(val)),
  );
  return harden({ body, slots });
};

test.todo('client can refer to $ag.brand.IST without vstorage query');
test.todo('walletFactory marshals IST using $ag.brand.IST? or boardID?');
test.todo('client can add an issuer by setting issuer.my.BRD');
test.todo('send to namesByAddress.agoric1323432.depositFacet');
test.todo('send to contact.fred.depositFacet');
test.todo('subsume offer result lookup: $offer.bid34.result');
test.todo('send invitation received as offer result to contact.fred');
test.todo('smartWallet does _not_ publish offer result');
