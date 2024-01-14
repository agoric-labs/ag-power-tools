// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { E } from '@endo/far';
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
import { documentStorageSchema } from './storageDoc.js';

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
  const {
    powers: powers0,
    bundles,
    boardAux,
  } = await bootAndInstallBundles(t, assets);
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

  /**
   * @type {import('./market-actors').WellKnown &
   *  import('./market-actors').WellKnownKinds &
   *  import('./market-actors').BoardAux}
   */
  const wellKnown = {
    installation: powers.installation.consume,
    instance: powers.instance.consume,
    issuer: powers.issuer.consume,
    brand: powers.brand.consume,
    assetKind: new Map(
      /** @type {[Brand, AssetKind][]} */ ([[brand.Invitation, AssetKind.SET]]),
    ),
    boardAux,
  };

  const { zoe, namesByAddressAdmin, chainStorage } = powers.consume;
  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    {
      Invitation: await wellKnown.issuer.Invitation,
      IST: wellKnown.issuer.IST,
    },
  );

  const shared = { destAddr: 'agoric1receiverRoseStart' };
  const wallet = {
    sam: await walletFactory.makeSmartWallet('agoric1senderSamStart'),
    rose: await walletFactory.makeSmartWallet(shared.destAddr),
  };
  const toSend = { ToDoEmpty: AmountMath.make(brand.Invitation, harden([])) };
  const sam = starterSam(t, { wallet: wallet.sam, ...id.postalSvc }, wellKnown);
  await Promise.all([
    E(sam)
      .getPostalSvcTerms()
      .then(customTerms =>
        E(sam)
          .installAndStart({ label: 'postalSvc', ...id.postalSvc, customTerms })
          .then(({ instance: postalSvc }) => {
            const terms = { postalSvc, destAddr: shared.destAddr };
            senderContract(t, { zoe, terms });
          }),
      ),
    receiverRose(t, { wallet: wallet.rose }, wellKnown, { toSend }),
  ]);

  const storage = await powers.consume.chainStorage;
  const note = `Terms of contractStarter and the contracts it starts are published under boardAux`;
  await documentStorageSchema(t, storage, { note });
});
