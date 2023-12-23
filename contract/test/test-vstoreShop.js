// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { createRequire } from 'node:module';
import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeIssuerKit } from '@agoric/ertp';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { makePromiseSpace, makeNameHubKit } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { withAmountUtils } from './ertp-aux.js';

import { contractName, startVstoreShop } from '../src/start-vstoreShop.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  vstoreShop: myRequire.resolve('../src/vstoreShop.js'),
};

const makeTestContext = async () => {
  const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));

  const zoe = await makeZoeForTest();

  /** @type {Installation<import('../src/vstoreShop.js').start>} */
  const installation = await E(zoe).install(
    await bundleCache.load(assets.vstoreShop, contractName),
  );

  return { bundleCache, zoe, installation };
};

test.before(async t => (t.context = await makeTestContext()));

/**
 * @param {ERef<ZoeService>} zoe
 * @param {Instance} shop
 * @param {Purse} purse
 */
const alice = async (zoe, shop, purse) => {
  const publicFacet = E(zoe).getPublicFacet(shop);
  const toBuy = await E(publicFacet).makeBuyStorageInvitation();
  const { basePrice } = await E(zoe).getTerms(shop);
  const proposal = { give: { Payment: basePrice } };
  const Payment = await E(purse).withdraw(proposal.give.Payment);
  const seat = await E(zoe).offer(
    toBuy,
    proposal,
    { Payment },
    { slug: 'alice-info' },
  );
  /** @type {ERef<StorageNode>} */
  const node = await E(seat).getOfferResult();
  // TODO: get payouts; return extras to purse

  await E(node).setValue('Hello, world!');
};

test('buy and write to storage', async t => {
  const { zoe, installation } = t.context;

  const money = withAmountUtils(makeIssuerKit('Money'));

  const { rootNode, data } = makeFakeStorageKit('X');
  const { instance: shopInstance } = await E(zoe).startInstance(
    installation,
    { Payment: money.issuer },
    { basePrice: money.units(3) },
    { storageNode: rootNode },
  );

  const ap = money.issuer.makeEmptyPurse();
  ap.deposit(money.mint.mintPayment(money.units(10)));
  await alice(zoe, shopInstance, ap);

  t.deepEqual(
    [...data.entries()],
    [['X.alice-info', '{"blockHeight":"0","values":["Hello, world!"]}']],
  );
});

/**
 * Mock enough powers for startVstoreShop permit.
 *
 * @param {(...args: unknown[]) => void} log
 */
const mockBootstrap = async log => {
  const { produce, consume } = makePromiseSpace();
  const { admin, vatAdminState } = makeFakeVatAdmin();
  const zoe = makeZoeForTest(admin);
  const feeIssuer = await E(zoe).getFeeIssuer();
  const feeBrand = await E(feeIssuer).getBrand();

  const { rootNode: chainStorage, data } = makeFakeStorageKit('X');

  const { nameHub: agoricNames, nameAdmin: agoricNamesAdmin } =
    makeNameHubKit();
  const spaces = await makeWellKnownSpaces(agoricNamesAdmin, log, [
    'installation',
    'instance',
    'issuer',
    'brand',
  ]);

  produce.zoe.resolve(zoe);
  produce.chainStorage.resolve(chainStorage);
  spaces.issuer.produce.IST.resolve(feeIssuer);
  spaces.brand.produce.IST.resolve(feeBrand);
  const powers = { produce, consume, ...spaces };

  return { powers, vatAdminState, vstorageData: data };
};

test('start contract from bootstrap', async t => {
  t.log('bootstrap');
  const { powers, vatAdminState, vstorageData } = await mockBootstrap(t.log);

  const { bundleCache } = t.context;
  const bundle = await bundleCache.load(assets.vstoreShop, contractName);
  t.log('publish bundle', bundle.endoZipBase64Sha512.slice(0, 5));
  vatAdminState.installBundle(bundle.endoZipBase64Sha512, bundle);

  const contractOpts = { priceUnits: 10 };
  t.log('start contract', contractName, contractOpts);
  const opts = { bundleID: bundle.endoZipBase64Sha512, ...contractOpts };
  await startVstoreShop(powers, { options: { [contractName]: opts } });

  const { zoe } = powers.consume;
  const { [contractName]: instanceP } = powers.instance.consume;
  const { IST: istIssuerP } = powers.issuer.consume;
  const ap = E(istIssuerP).makeEmptyPurse();
  //   ap.deposit(money.mint.mintPayment(money.units(10)));
  await alice(zoe, instanceP, ap);

  t.deepEqual(
    [...vstorageData.entries()],
    [['X.alice-info', '{"blockHeight":"0","values":["Hello, world!"]}']],
  );
});
