// @ts-check
import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'node:module';
import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeIssuerKit } from '@agoric/ertp';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { makePromiseSpace, makeNameHubKit } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { withAmountUtils } from './ertp-aux.js';

import { contractName, startVstoreShop } from '../src/start-vstoreShop.js';
import { makeStableFaucet } from './mintStable.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  vstoreShop: myRequire.resolve('../src/vstoreShop.js'),
};

const makeTestContext = async () => {
  const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));

  const { zoeService: zoe } = await makeZoeKitForTest();

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
 * Plus access to load bundles, peek at vstorage, and mint IST.
 *
 * @param {(...args: unknown[]) => void} log
 */
const mockBootstrap = async log => {
  const { produce, consume } = makePromiseSpace();
  const { admin, vatAdminState } = makeFakeVatAdmin();
  const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest(admin);
  const feeIssuer = await E(zoe).getFeeIssuer();
  const feeBrand = await E(feeIssuer).getBrand();

  const { rootNode: chainStorage, data } = makeFakeStorageKit('published');

  const { nameHub: agoricNames, nameAdmin: agoricNamesAdmin } =
    makeNameHubKit();
  const spaces = await makeWellKnownSpaces(agoricNamesAdmin, log, [
    'installation',
    'instance',
    'issuer',
    'brand',
  ]);

  produce.zoe.resolve(zoe);
  produce.feeMintAccess.resolve(feeMintAccess);
  produce.chainStorage.resolve(chainStorage);
  spaces.issuer.produce.IST.resolve(feeIssuer);
  spaces.brand.produce.IST.resolve(feeBrand);
  const powers = { produce, consume, ...spaces };

  return { powers, vatAdminState, vstorageData: data };
};

test('start vstoreShop contract from bootstrap', async t => {
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

  const { feeMintAccess } = powers.consume;
  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });
  const stableValue = BigInt(contractOpts.priceUnits * 3);
  const alicePurse = await faucet(stableValue * 1_000_000n);
  t.log('alice starts with', stableValue, 'IST');
  await alice(zoe, instanceP, alicePurse);

  const actual = Object.fromEntries([...vstorageData.entries()]);
  t.log('storage after alice', actual);
  t.deepEqual(actual, {
    'published.vstoreShop.alice-info':
      '{"blockHeight":"0","values":["Hello, world!"]}',
  });
});
