// @ts-check
// XXX what's the state-of-the-art in ava setup?
// eslint-disable-next-line import/order
import { test as anyTest } from './prepare-test-env-ava.js';

import { createRequire } from 'module';

import { E, Far } from '@endo/far';
import { unsafeMakeBundleCache } from '@agoric/swingset-vat/tools/bundleTool.js';
import { makeNameHubKit, makePromiseSpace } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { startPostalSvc } from '../src/start-postalSvc.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  postalSvc: myRequire.resolve('../src/postalSvc.js'),
};

const makeTestContext = async t => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');

  return { bundleCache };
};

test.before(async t => (t.context = await makeTestContext(t)));

const bootstrap = async log => {
  const { produce, consume } = makePromiseSpace();

  const { admin, vatAdminState } = makeFakeVatAdmin();
  const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest(admin);

  const { nameHub: agoricNames, nameAdmin: agoricNamesAdmin } =
    makeNameHubKit();
  const spaces = await makeWellKnownSpaces(agoricNamesAdmin, log, [
    'installation',
    'instance',
  ]);

  const { nameAdmin: namesByAddressAdmin } = makeNameHubKit();

  produce.zoe.resolve(zoe);
  produce.feeMintAccess.resolve(feeMintAccess);
  produce.agoricNames.resolve(agoricNames);
  produce.namesByAddressAdmin.resolve(namesByAddressAdmin);

  /** @type {BootstrapPowers}}  */
  // @ts-expect-error mock
  const powers = { produce, consume, ...spaces };

  return { powers, vatAdminState };
};

test('deliver payment using address', async t => {
  t.log('bootstrap');
  const { powers, vatAdminState } = await bootstrap(t.log);

  const { bundleCache } = t.context;
  const bundle = await bundleCache.load(assets.postalSvc, 'postalSvc');
  const bundleID = `b1-${bundle.endoZipBase64Sha512}`;
  t.log('publish bundle', bundleID.slice(0, 8));
  vatAdminState.installBundle(bundleID, bundle);

  await startPostalSvc(powers, {
    options: { postalSvc: { bundleID } },
  });

  const { agoricNames, zoe, namesByAddressAdmin } = powers.consume;

  const instance = await E(agoricNames).lookup('instance', 'postalSvc');

  const addr1 = 'agoric1receiver';

  const rxd = [];
  const depositFacet = Far('DepositFacet', {
    /** @param {Payment} pmt */
    receive: async pmt => {
      rxd.push(pmt);
      // XXX should return amount of pmt
    },
  });

  const my = makeNameHubKit();
  my.nameAdmin.update('depositFacet', depositFacet);
  await E(namesByAddressAdmin).update(addr1, my.nameHub, my.nameAdmin);

  const { issuers, brands } = await E(zoe).getTerms(instance);
  const postalSvc = E(zoe).getPublicFacet(instance);
  const purse = await E(issuers.IST).makeEmptyPurse();

  const pmt1 = await E(purse).withdraw(AmountMath.make(brands.IST, 0n));

  // XXX should test that return value is amount
  t.log('send IST with public facet to', addr1);
  await E(postalSvc).sendTo(addr1, pmt1);
  t.deepEqual(rxd, [pmt1]);

  {
    const Payment = AmountMath.make(brands.IST, 0n);
    const pmt2 = await E(postalSvc).makeSendInvitation(addr1);
    const pmt3 = await E(purse).withdraw(Payment);
    const Invitation = await E(issuers.Invitation).getAmountOf(pmt2);
    const proposal = { give: { Payment, Invitation } };
    t.log('make offer to send IST, Invitation to', addr1);
    const seat = E(zoe).offer(
      E(postalSvc).makeSendInvitation(addr1),
      proposal,
      { Payment: pmt3, Invitation: pmt2 },
    );
    // XXX test is overly sensitive to order?
    const result = await E(seat).getOfferResult();
    t.is(result, 'sent Invitation, Payment');
    t.deepEqual(rxd, [pmt1, pmt2, pmt3]);
    const done = await E(seat).getPayouts();
  }
});
test.todo('partial failure: send N+1 payments where >= 1 delivery fails');
