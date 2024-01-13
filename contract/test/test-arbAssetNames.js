// @ts-check
/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
// import { test } from './prepare-test-env-ava.js';
import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';

import {
  bootAndInstallBundles,
  getBundleId,
  makeBundleCacheContext,
} from './boot-tools.js';
import { startArbAssetName } from '../src/start-arbAssetName.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

const nodeRequire = createRequire(import.meta.url);

const contractName = 'arbAssetNames';
const bundleRoots = {
  [contractName]: nodeRequire.resolve('../src/arbAssetNames.js'),
};

test('Start arbitrary asset naming contract', async t => {
  const { powers, bundles } = await bootAndInstallBundles(t, bundleRoots);

  await startArbAssetName(powers, {
    assetNamingOptions: {
      bundleID: getBundleId(bundles[contractName]),
      price: 100n,
      unit: 1_000_000n,
    },
  });
  const instance = await powers.instance.consume.arbAssetName;
  t.log(instance);
  t.is(typeof instance, 'object');
});

test.todo('publish an issuer / brand');

test('ok?', t => t.pass());
