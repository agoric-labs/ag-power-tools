// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { createRequire } from 'node:module';
import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeIssuerKit, AmountMath } from '@agoric/ertp';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { makePromiseSpace, makeNameHubKit } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { withAmountUtils } from './ertp-aux.js';

const { Fail } = assert;

const { fromEntries, entries, keys } = Object;

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  vstoreShop: myRequire.resolve('../src/vstoreShop.js'),
};
const [contractName] = keys(assets);

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
 * @param {Brand} brand
 * @param {number} n
 * @param {number} decimalPlaces
 */
const units = (brand, n, decimalPlaces) =>
  AmountMath.make(brand, BigInt(Math.round(n * 10 ** decimalPlaces)));

const mockBootstrap = async log => {
  const { produce, consume } = makePromiseSpace();
  const { admin, vatAdminState } = makeFakeVatAdmin();
  const zoe = makeZoeForTest(admin);
  produce.zoe.resolve(zoe);

  const { rootNode: chainStorage, data } = makeFakeStorageKit('X');
  produce.chainStorage.resolve(chainStorage);

  const { nameHub: agoricNames, nameAdmin: agoricNamesAdmin } =
    makeNameHubKit();
  const spaces = await makeWellKnownSpaces(agoricNamesAdmin, log, [
    'installation',
    'instance',
    'issuer',
    'brand',
  ]);
  const feeIssuer = await E(zoe).getFeeIssuer();
  const feeBrand = await E(feeIssuer).getBrand();
  spaces.issuer.produce.IST.resolve(feeIssuer);
  spaces.brand.produce.IST.resolve(feeBrand);
  const powers = { produce, consume, ...spaces };
  return { powers, vatAdminState, vstorageData: data };
};

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
const allValues = async obj => {
  const es = await Promise.all(
    entries(obj).map(async ([k, v]) => [k, await v]),
  );
  return fromEntries(es);
};

/**
 * @param {import('@agoric/vats').BootstrapPowers} powers
 * @param {{ options?: { vstoreShop?: { bundleID?: string, priceUnits }}}} [config]
 */
const startVstoreShop = async (powers, config = {}) => {
  const { bundleID = Fail`missing bundleID`, priceUnits = 50 } =
    config.options?.vstoreShop || {};
  const {
    consume: { zoe, chainStorage },
    issuer: {
      consume: { IST: istIssuerP },
    },
    brand: {
      consume: { IST: istBrandP },
    },
    installation: {
      produce: { [contractName]: produceInstallation },
    },
    instance: {
      produce: { [contractName]: produceInstance },
    },
  } = powers;

  /** @type {Installation<import('../src/vstoreShop.js').start>} */
  const installation = await E(zoe).installBundleID(bundleID);

  const { storageNode, istIssuer } = await allValues({
    storageNode: E(chainStorage).makeChildNode(contractName),
    istIssuer: istIssuerP,
  });
  const {
    istBrand,
    displayInfo: { decimalPlaces },
  } = await allValues({
    istBrand: istBrandP,
    displayInfo: E(istBrandP).getDisplayInfo(),
  });

  produceInstallation.resolve(installation);

  const started = await E(zoe).startInstance(
    installation,
    { Payment: istIssuer },
    { basePrice: units(istBrand, priceUnits, decimalPlaces) },
    { storageNode },
  );
  produceInstance.resolve(started.instance);
};

test('start contract from bootstrap', async t => {
  t.log('bootstrap');
  const { powers, vatAdminState, vstorageData } = await mockBootstrap(t.log);

  t.log('publish bundle');
  const { bundleCache } = t.context;
  const bundle = await bundleCache.load(assets.vstoreShop, contractName);
  vatAdminState.installBundle(bundle.endoZipBase64Sha512, bundle);

  t.log('start contract');
  await startVstoreShop(powers, {
    options: { [contractName]: { bundleID: bundle.endoZipBase64Sha512 } },
  });

  const {
    consume: { zoe },
    issuer: {
      consume: { IST: istIssuerP },
    },
    instance: {
      consume: { [contractName]: instanceP },
    },
  } = powers;
  const ap = E(istIssuerP).makeEmptyPurse();
  //   ap.deposit(money.mint.mintPayment(money.units(10)));
  await alice(zoe, instanceP, ap);

  t.deepEqual(
    [...vstorageData.entries()],
    [['X.alice-info', '{"blockHeight":"0","values":["Hello, world!"]}']],
  );
});
