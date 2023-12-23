// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import path from 'path';
import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { setUpZoeForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { makeIssuerKit } from '@agoric/ertp';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { withAmountUtils } from './ertp-aux.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const pathname = new URL(import.meta.url).pathname;
const dirname = path.dirname(pathname);

const assets = {
  vstoreShop: `${dirname}/../src/vstoreShop.js`,
};

const makeTestContext = async () => {
  const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));

  const { zoe } = await setUpZoeForTest();

  /** @type {Installation<import('../src/vstoreShop.js').start>} */
  const installation = await E(zoe).install(
    await bundleCache.load(assets.vstoreShop, 'vstoreShop'),
  );

  return { zoe, installation };
};

test.before(async t => (t.context = await makeTestContext()));

test('buy and write to storage', async t => {
  const { zoe, installation } = t.context;

  const money = withAmountUtils(makeIssuerKit('Money'));

  const { rootNode, data } = makeFakeStorageKit('X');
  const { publicFacet, instance: shopInstance } = await E(zoe).startInstance(
    installation,
    { Payment: money.issuer },
    { basePrice: money.units(3) },
    { storageNode: rootNode },
  );

  /**
   * @param {Instance} shop
   * @param {Purse} purse
   */
  const alice = async (shop, purse) => {
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

  const ap = money.issuer.makeEmptyPurse();
  ap.deposit(money.mint.mintPayment(money.units(10)));
  await alice(shopInstance, ap);

  t.deepEqual(
    [...data.entries()],
    [['X.alice-info', '{"blockHeight":"0","values":["Hello, world!"]}']],
  );
});
