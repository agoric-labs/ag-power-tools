// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import { unsafeMakeBundleCache } from '@agoric/swingset-vat/tools/bundleTool.js';
import { makeNameHubKit, makePromiseSpace } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';
import { makeFakeBankKit } from '@agoric/vats/tools/bank-utils.js';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { makeFakeBoard } from '@agoric/vats/tools/board-utils.js';
// import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { startIBCToken } from '../src/start-ibcToken.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  ibcToken: myRequire.resolve('../src/ibcToken.js'),
};

const makeTestContext = async t => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');
  // XXX should we create an instance that has access to the creatorFacet?
  // const { zoeService: zoe } = await makeZoeKitForTest();
  return { bundleCache };
};

test.before(async t => (t.context = await makeTestContext(t)));

const bootstrap = async (log, config) => {
  const { produce, consume } = makePromiseSpace();
  const { admin, vatAdminState } = makeFakeVatAdmin();
  const { zoeService: zoe } = makeZoeKitForTest(admin);
  // const testToken = withAmountUtils(makeIssuerKit('TEST'));

  const { rootNode: chainStorage, data } = makeFakeStorageKit('published');

  const { nameHub: agoricNames, nameAdmin: agoricNamesAdmin } =
    makeNameHubKit();
  const spaces = await makeWellKnownSpaces(agoricNamesAdmin, log, [
    'installation',
    'instance',
    'issuer',
    'brand',
  ]);

  const { nameAdmin: namesByAddressAdmin } = makeNameHubKit();

  produce.zoe.resolve(zoe);
  produce.agoricNames.resolve(agoricNames);
  produce.board.resolve(makeFakeBoard());
  produce.chainStorage.resolve(chainStorage);
  produce.namesByAddressAdmin.resolve(namesByAddressAdmin);
  // spaces.issuer.produce[config.tokenKeyword].resolve('XXXTOKENISSUER');
  // spaces.brand.produce[config.tokenKeyword].resolve('XXXTOKENBRAND');

  const fakeBankKit = makeFakeBankKit([]);
  produce.bankManager.resolve(
    Promise.resolve(
      Far(
        'mockBankManager',
        /** @type {any} */ ({
          getBankForAddress: _a => fakeBankKit.bank,
          addAsset: fakeBankKit.addAsset,
        }),
      ),
    ),
  );

  /** @type {BootstrapPowers}}  */
  // @ts-expect-error mock
  const powers = { produce, consume, ...spaces };

  return { powers, vatAdminState };
};

test('ibcToken installation', async t => {
  const config = {
    tokenKeyword: 'TEST',
    tokenDecimals: 6,
    proposedName: 'testIBCToken',
    denom: 'utest',
  };
  t.log('bootstrap');
  const { powers, vatAdminState } = await bootstrap(t.log, config);
  const { bundleCache } = t.context;
  const bundle = await bundleCache.load(assets.ibcToken, 'ibcToken');
  const bundleID = `b1-${bundle.endoZipBase64Sha512}`;
  t.log('publish bundle', bundleID.slice(0, 8));
  vatAdminState.installBundle(bundleID, bundle);

  await startIBCToken(powers, {
    options: {
      ibcToken: { bundleID },
      ...config,
    },
  });

  const { agoricNames } = powers.consume;

  const instance = await E(agoricNames).lookup('instance', 'testTokenKit');

  t.log('instance', instance);
  t.truthy(instance);
});

test.todo('issuer exists in agoricNames');
test.todo('issuer exists in vbankAssets');
test.todo('holder of creator facet can mint tokens');
test.todo('querying cosmos bank should return a utest balance');
