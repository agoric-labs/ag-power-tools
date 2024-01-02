// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { createRequire } from 'module';

import { E } from '@endo/far';
import { makeBundleCacheContext, makeBootstrapPowers } from './boot-tools.js';
import { mockWalletFactory } from './wallet-tools.js';
import { makeNameHubKit } from '@agoric/vats';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';

const nodeRequire = createRequire(import.meta.url);

const contractName = 'launchIt';
const assets = {
  [contractName]: nodeRequire.resolve('../src/launchIt.js'),
};

const { Fail } = assert;

const idOf = b => `b1-${b.endoZipBase64Sha512}`;

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

/**
 *
 * @param {BootstrapPowers} powers
 * @param {*} config
 */
const startLaunchIt = async (powers, config) => {
  const {
    consume: { zoe, chainTimerService },
    installation: {
      produce: { [contractName]: produceInstallation },
    },
    instance: {
      produce: { [contractName]: produceInstance },
    },
  } = powers;
  const { bundleID = Fail`no bundleID` } = config.options?.[contractName] ?? {};
  /** @type {Installation<import('../src/launchIt.js').start>} */
  const installation = await E(zoe).installBundleID(bundleID);
  produceInstallation.resolve(installation);

  const timerBrand = await E(chainTimerService).getTimerBrand();
  // TODO: use startUpgradeable
  const started = await E(zoe).startInstance(
    installation,
    {},
    { timerBrand },
    { timerService: await chainTimerService },
  );
  produceInstance.resolve(started.instance);
};

test.serial('start contract', async t => {
  const { powers, vatAdminState } = await makeBootstrapPowers(t.log);

  const { bundleCache } = t.context;
  const bundle = await bundleCache.load(assets[contractName], contractName);
  const bundleID = idOf(bundle);
  t.log('publish bundle', bundleID.slice(0, 8));
  vatAdminState.installBundle(bundleID, bundle);

  await startLaunchIt(powers, {
    options: { [contractName]: { bundleID } },
  });

  const { agoricNames } = powers.consume;
  const instance = await E(agoricNames).lookup('instance', contractName);
  t.is(typeof instance, 'object');

  t.context.shared.powers = powers;
});

test.serial('launch a token', async t => {
  t.log('Creator Cathy chooses to launch a new token, CDOG, paired with MNY');

  /**
   *
   * @param {*} wellKnown
   * @param {import('./wallet-tools.js').MockWallet} wallet
   */
  const cathy = async (wellKnown, wallet) => {
    const timerBrand = await wellKnown.brand.consume.timerBrand;
    const deadline = harden({ timerBrand, absValue: 10n });

    /** @type {import('@agoric/smart-wallet').OfferSpec} */
    const offerSpec = {
      id: 'launch-1',
      invitationSpec: {
        source: 'contract',
        instance: await wellKnown.instance.consume[contractName],
        publicInvitationMaker: 'createLaunchInvitation',
        invitationArgs: [
          {
            name: 'CDOG',
            supplyQty: 1_000_000n,
            deadline,
          },
        ],
      },
      proposal: { give: {} },
    };

    t.log('1,000,000 CDOG tokens are minted and locked up in a pool');
    const updates = await E(wallet.offers).executeOffer(offerSpec);

    const {
      value: {
        status: { invitationSpec: _i1, proposal: _p1, ...info1 },
      },
    } = await updates.next();
    t.log('update 1', info1);
    t.deepEqual(info1.id, offerSpec.id);
    const {
      value: {
        status: { invitationSpec: _i2, proposal: _p2, ...info2 },
      },
    } = await updates.next();
    t.log('update 2', info2);
    t.deepEqual(info2.result, 'CDOG');
  };

  const powers = t.context.shared.powers;
  const wellKnown = {
    instance: powers.instance,
    issuer: powers.issuer,
    brand: powers.brand,
  };

  const { zoe } = powers.consume;

  const { nameAdmin: namesByAddressAdmin } = await makeNameHubKit();
  const { rootNode: chainStorage, data } = makeFakeStorageKit('published');
  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    { Invitation: invitationIssuer },
  );
  await cathy(wellKnown, await walletFactory.makeSmartWallet('agoric1cathy'));
  t.log('TODO: pool is open for contributions');
  t.log('TODO: boostrap time is up. swap contributions');
  t.log('TODO Cathy withdraws proceeds');
});
