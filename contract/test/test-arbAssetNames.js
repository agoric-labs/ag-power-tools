// @ts-check
/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
// import { test } from './prepare-test-env-ava.js';
import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'module';

import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeIssuerKit, AmountMath } from '@agoric/ertp';
import { makeBootstrapPowers, makeBundleCacheContext } from './boot-tools.js';

/** @typedef {typeof import('../src/arbAssetNames.js').start} ContractFn */

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

const nodeRequire = createRequire(import.meta.url);

const contractName = 'arbAssetNames';
const assets = {
  [contractName]: nodeRequire.resolve('../src/arbAssetNames.js'),
};

const idOf = b => `b1-${b.endoZipBase64Sha512}`;

test('Start the contract', async t => {
  const { bundleCache } = t.context;

  const money = makeIssuerKit('PlayMoney');
  const issuers = { Price: money.issuer };
  const terms = { Price: AmountMath.make(money.brand, 5n) };
  t.log('terms:', terms);

  const { powers, vatAdminState } = await makeBootstrapPowers(t.log);
  const bundle = await bundleCache.load(assets[contractName], contractName);
  const bundleID = idOf(bundle);
  t.log('publish bundle', bundleID.slice(0, 8));
  vatAdminState.installBundle(bundleID, bundle);

  const zoe = powers.consume.zoe;

  /** @type {ERef<Installation<ContractFn>>} */
  const installation = E(zoe).install(bundle);
  const { instance } = await E(zoe).startInstance(installation, issuers, terms);
  t.log(instance);
  t.is(typeof instance, 'object');
});

test.todo('publish an issuer / brand');

test('ok?', t => t.pass());
