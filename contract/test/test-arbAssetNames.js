// @ts-check
/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
// import { test } from './prepare-test-env-ava.js';
import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';

import { E } from '@endo/far';
import {
  bootAndInstallBundles,
  getBundleId,
  makeBundleCacheContext,
} from './boot-tools.js';
import { startArbAssetName } from '../src/start-arbAssetName.js';
import { mockWalletFactory } from './wallet-tools.js';
import { launcherLarry } from './market-actors.js';
import { makeStableFaucet } from './mintStable.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

const nodeRequire = createRequire(import.meta.url);

const contractName = 'arbAssetNames';
const bundleRoots = {
  [contractName]: nodeRequire.resolve('../src/arbAssetNames.js'),
};

test('launcher Larry publishes his asset type', async t => {
  const { powers, bundles } = await bootAndInstallBundles(t, bundleRoots);

  const config = {
    bundleID: getBundleId(bundles[contractName]),
    price: 100n,
    unit: 1_000_000n,
  };
  await startArbAssetName(powers, { assetNamingOptions: config });
  const instance = await powers.instance.consume.arbAssetName;
  t.log(instance);
  t.is(typeof instance, 'object');

  const { agoricNames, zoe, namesByAddressAdmin, chainStorage, feeMintAccess } =
    powers.consume;
  const { price } = await E(zoe).getTerms(instance);
  const wellKnown = {
    installation: {},
    instance: powers.instance.consume,
    issuer: powers.issuer.consume,
    brand: powers.brand.consume,
    terms: { arbAssetName: { price } },
  };

  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    {
      Invitation: await wellKnown.issuer.Invitation,
      IST: await wellKnown.issuer.IST,
    },
  );
  const { bundleCache } = t.context;
  const { faucet } = makeStableFaucet({ feeMintAccess, zoe, bundleCache });
  const funds = await E(faucet)(price.value * 2n);
  const wallet = await walletFactory.makeSmartWallet('agoric1launcherLarry');
  await E(wallet.deposit).receive(funds.withdraw(funds.getCurrentAmount()));
  const info = await launcherLarry(t, { wallet }, wellKnown);
  const publishedBrand = await E(agoricNames).lookup('brand', info.id);
  t.log(info.brand, 'at', info.id);
  t.is(publishedBrand, info.brand);
});

test.todo('publish an issuer / brand');

test('ok?', t => t.pass());
