// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { AmountMath, AssetKind } from '@agoric/ertp';
import { createRequire } from 'module';
import {
  bootAndInstallBundles,
  getBundleId,
  makeBundleCacheContext,
} from './boot-tools.js';
import {
  installContractStarter,
  startContractStarter,
} from '../src/start-contractStarter.js';
import { mockWalletFactory } from './wallet-tools.js';
import { receiverRose, senderContract, starterSam } from './market-actors.js';

/** @typedef {import('../src/start-contractStarter.js').ContractStarterPowers} ContractStarterPowers */

const myRequire = createRequire(import.meta.url);

const assets = {
  contractStarter: myRequire.resolve('../src/contractStarter.js'),
  postalSvc: myRequire.resolve('../src/postalSvc.js'),
};

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

test('use contractStarter to start postalSvc', async t => {
  const { powers: powers0, bundles } = await bootAndInstallBundles(t, assets);
  const id = {
    contractStarter: { bundleID: getBundleId(bundles.contractStarter) },
    postalSvc: { bundleID: getBundleId(bundles.postalSvc) },
  };
  /** @type { typeof powers0 & ContractStarterPowers} */
  // @ts-expect-error bootstrap powers evolve with BLD staker governance
  const powers = powers0;

  await installContractStarter(powers, {
    options: { contractStarter: id.contractStarter },
  });
  await startContractStarter(powers, {});

  const brand = {
    Invitation: await powers.brand.consume.Invitation,
  };
  /** @type {import('./market-actors.js').WellKnownK} */
  const wellKnown = {
    installation: powers.installation.consume,
    instance: powers.instance.consume,
    issuer: powers.issuer.consume,
    brand: powers.brand.consume,
    assetKind: new Map(
      /** @type {[Brand, AssetKind][]} */ ([[brand.Invitation, AssetKind.SET]]),
    ),
  };

  const {
    zoe,
    namesByAddress: nbaP,
    namesByAddressAdmin,
    chainStorage,
  } = powers.consume;
  const namesByAddress = await nbaP;
  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    { Invitation: await wellKnown.issuer.Invitation },
  );

  const shared = { destAddr: 'agoric1receiverRoseStart' };
  const wallet = {
    sam: await walletFactory.makeSmartWallet('agoric1senderSamStart'),
    rose: await walletFactory.makeSmartWallet(shared.destAddr),
  };
  const toSend = { ToDoEmpty: AmountMath.make(brand.Invitation, harden([])) };
  await Promise.all([
    starterSam(
      t,
      { wallet: wallet.sam, ...id.postalSvc, namesByAddress },
      wellKnown,
    ).then(({ instance: postalSvc }) => {
      const terms = { postalSvc, destAddr: shared.destAddr };
      senderContract(t, { zoe, terms });
    }),
    receiverRose(t, { wallet: wallet.rose }, wellKnown, { toSend }),
  ]);
});
