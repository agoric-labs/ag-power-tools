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
import '@endo/init/debug.js';
import test from 'ava';
import { Far, makeMarshal } from '@endo/marshal';
import { makeNameHubKit } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';

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

test('client can refer to $ag.brand.IST without vstorage query', async t => {
  const wk = makeNameHubKit(); // well known; aka agoricNames
  const spaces = await makeWellKnownSpaces(wk.nameAdmin, t.log);
  const istBrand = Far('IST brand mock', {});
  spaces.brand.produce.IST.resolve(istBrand);

  // gems have facets

  const my = makeNameHubKit();
  // A.$my.brand = A.$ag.brand
  await my.nameAdmin.update('brand', wk.nameHub.lookup('brand'));

  const bigintReplacer = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
  const lit = x => JSON.stringify(x, bigintReplacer);

  const offerSpec = {
    body: `#${lit({
      proposal: {
        give: { Price: { brand: '$0.Alleged IST Brand', value: 123n } },
      },
    })}`,
    /** @type {PetSlot[]} */
    slots: ['.$my.brand.IST'],
  };

  // A.$my.kread.characterBrand
  // A.$my.kread.characterIssuer

  // agoricNames.brand
  // agoricNames.issuer

  // agoricNames.asset.IST.brand
  // agoricNames.asset.IST.issuer

  // A.$my.kread.character.brand

  // idea: a.thing.other js => lookup()
  const walletHub = makeNameHubKit();
  // A.wallet['$my'] = my
  walletHub.nameAdmin.update('$my', my.nameHub);
  walletHub.nameAdmin.update('$ag', wk.nameHub);

  const x = await parse(offerSpec, (path, ...args) =>
    walletHub.nameHub.lookup(...path.slice(1).split('.'), ...args),
  );
  t.log(x.proposal);
});

test.todo('walletFactory marshals IST using $ag.brand.IST? or boardID?');
test.todo('client can add an issuer by setting issuer.my.BRD');
test.todo('client can add issuers by referring to them in a new offer field');
test.todo('client can add issuers using a new smartWallet method');
test.todo('send to namesByAddress.agoric1323432.depositFacet');
test.todo('send to contact.fred.depositFacet');
test.todo('subsume offer result lookup: $offer.bid34.result');
test.todo('send invitation received as offer result to contact.fred');
test.todo('smartWallet does _not_ publish offer result');
test.todo('lookup can get brand from issuer with .getBrand()');
test.todo('lookup from an instance: .getTerms(), ["issuers"], ["BRD"]');
test.todo('.receive() with new brand creates purse if path to issuer exists');
test.todo('how to process queued payments if issuer is added later?');
test.todo(
  `CRAZY? use interface name
  to distinguish brands from issuers when starting lookup`,
);
