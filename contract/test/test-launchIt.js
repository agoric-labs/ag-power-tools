// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { createRequire } from 'module';

import { E } from '@endo/far';
import { makeBundleCacheContext, makeBootstrapPowers } from './boot-tools.js';
import { mockWalletFactory } from './wallet-tools.js';
import { makeNameHubKit } from '@agoric/vats';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { makeIssuerKit } from '@agoric/ertp';

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
  const { bundleID = Fail`no bundleID`, issuers = {} } =
    config.options?.[contractName] ?? {};
  /** @type {Installation<import('../src/launchIt.js').start>} */
  const installation = await E(zoe).installBundleID(bundleID);
  produceInstallation.resolve(installation);

  // TODO: use startUpgradeable
  const started = await E(zoe).startInstance(installation, issuers);
  produceInstance.resolve(started.instance);
};

test.serial('start contract', async t => {
  const { powers, vatAdminState } = await makeBootstrapPowers(t.log);

  const { bundleCache } = t.context;
  const bundle = await bundleCache.load(assets[contractName], contractName);
  const bundleID = idOf(bundle);
  t.log('publish bundle', bundleID.slice(0, 8));
  vatAdminState.installBundle(bundleID, bundle);

  const MNY = makeIssuerKit('MNY');

  await startLaunchIt(powers, {
    options: { [contractName]: { bundleID, issuers: { MNY: MNY.issuer } } },
  });

  const { agoricNames } = powers.consume;
  const instance = await E(agoricNames).lookup('instance', contractName);
  t.is(typeof instance, 'object');

  Object.assign(t.context.shared, { powers, MNY });
});

test.serial('launch a token', async t => {
  t.log('Creator Cathy chooses to launch a new token, CDOG, paired with MNY');

  /**
   *
   * @param {*} wellKnown
   * @param {import('./wallet-tools.js').MockWallet} wallet
   */
  const cathy = async (wellKnown, wallet) => {
    const instance = await wellKnown.instance[contractName];
    const { timerService: timer } = wellKnown;
    const timerBrand = await wellKnown.brand.timer;
    const MNYbrand = await wellKnown.brand.MNY;

    {
      const deadline = harden({ timerBrand, absValue: 10n });

      /** @type {import('@agoric/smart-wallet').OfferSpec} */
      const launchOfferSpec = {
        id: 'mint-1',
        invitationSpec: {
          source: 'contract',
          instance,
          publicInvitationMaker: 'makeLaunchInvitation',
        },
        proposal: {
          give: {},
          want: { Deposit: AmountMath.makeEmpty(MNYbrand) },
          exit: { afterDeadline: { timer, deadline } },
        },
        offerArgs: { name: 'CDOG', supplyQty: 1_000_000n },
      };

      t.log('1,000,000 CDOG tokens are minted');
      const updates = await E(wallet.offers).executeOffer(launchOfferSpec);

      const expected = [
        { id: launchOfferSpec.id },
        { result: 0 },
        // { status: { numWantsSatisfied: 1 } },
        // { status: { payouts: '@@' } },
      ];
      for await (const selector of expected) {
        const {
          value: { status },
        } = await updates.next();
        t.log('expecting ##NN', selector);
        // t.log('update ##NN', value);
        t.like(status, selector);
      }
    }
  };

  const albert = async (wellKnown, wallet) => {
    const instance = await wellKnown.instance[contractName];
    /** @type {import('@agoric/smart-wallet').OfferSpec} */
    const offerSpec = {
      id: 'contribute-2',
      invitationSpec: {
        source: 'contract',
        instance,
        publicInvitationMaker: 'createSubscribeInvitation',
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
  };
  const { powers, MNY } = t.context.shared;

  powers.brand.produce.MNY.resolve(MNY.brand);
  powers.issuer.produce.MNY.resolve(MNY.issuer);
  const wellKnown = {
    timerService: await powers.consume.chainTimerService, // XXX
    instance: powers.instance.consume,
    issuer: powers.issuer.consume,
    brand: powers.brand.consume,
  };

  const { zoe } = powers.consume;

  const { nameAdmin: namesByAddressAdmin } = await makeNameHubKit();
  const { rootNode: chainStorage, data } = makeFakeStorageKit('published');
  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    { Invitation: invitationIssuer },
  );
  assert(await wellKnown.brand.timer, 'no timer brand???');
  await cathy(wellKnown, await walletFactory.makeSmartWallet('agoric1cathy'));
  t.log('TODO: pool is open for contributions');
  t.log('TODO: boostrap time is up. swap contributions');
  t.log('TODO Cathy withdraws proceeds');
});
