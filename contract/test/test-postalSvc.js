// @ts-check
// XXX what's the state-of-the-art in ava setup?
// eslint-disable-next-line import/order
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { createRequire } from 'module';

import { E, Far } from '@endo/far';
import { makeNameHubKit } from '@agoric/vats';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { startPostalSvc } from '../src/start-postalSvc.js';
import { makeBootstrapPowers, makeBundleCacheContext } from './boot-tools.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  postalSvc: myRequire.resolve('../src/postalSvc.js'),
};

test.before(async t => (t.context = await makeBundleCacheContext(t)));

test('deliver payment using address', async t => {
  t.log('bootstrap');
  const { powers, vatAdminState } = await makeBootstrapPowers(t.log);

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
