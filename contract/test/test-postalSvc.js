// @ts-check
// XXX what's the state-of-the-art in ava setup?
// eslint-disable-next-line import/order
import { test as anyTest } from './prepare-test-env-ava.js';

import { createRequire } from 'module';

import { E } from '@endo/far';
import { AmountMath, AssetKind } from '@agoric/ertp/src/amountMath.js';
import { makeIssuerKit } from '@agoric/ertp';
import { startPostalSvc } from '../src/start-postalSvc.js';
import {
  bootAndInstallBundles,
  getBundleId,
  makeBundleCacheContext,
} from './boot-tools.js';
import { allValues, mapValues, mockWalletFactory } from './wallet-tools.js';
import {
  payerPete,
  receiverRex,
  receiverRose,
  senderContract,
} from './market-actors.js';

const { entries, fromEntries, keys } = Object;

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

const nodeRequire = createRequire(import.meta.url);

const bundleRoots = {
  postalSvc: nodeRequire.resolve('../src/postalSvc.js'),
};

test.before(async t => (t.context = await makeBundleCacheContext(t)));

test('deliver payment using offer', async t => {
  const { powers: p0, bundles } = await bootAndInstallBundles(t, bundleRoots);
  /** @type { typeof p0 & import('../src/start-postalSvc.js').PostalSvcPowers} */
  // @ts-expect-error bootstrap powers evolve with BLD staker governance
  const powers = p0;

  const iKit = {
    MNY: makeIssuerKit('MNY'),
    Item: makeIssuerKit('Item', AssetKind.SET),
  };
  const { MNY, Item } = iKit;
  entries(iKit).forEach(([name, kit]) => {
    powers.issuer.produce[name].resolve(kit.issuer);
    powers.brand.produce[name].resolve(kit.brand);
  });

  const bundleID = getBundleId(bundles.postalSvc);
  await startPostalSvc(powers, {
    options: { postalSvc: { bundleID, issuerNames: ['MNY', 'Item'] } },
  });

  const { zoe, namesByAddressAdmin, chainStorage } = powers.consume;

  const smartWalletIssuers = {
    Invitation: await E(zoe).getInvitationIssuer(),
    IST: await E(zoe).getFeeIssuer(),
    MNY: MNY.issuer,
    Item: Item.issuer,
  };

  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    smartWalletIssuers,
  );

  const wellKnown = {
    installation: {},
    // TODO: have pete check installation before making an offer?
    // hm. don't think walletFactory supports that.
    instance: powers.instance.consume,
    issuer: {},
    brand: powers.brand.consume,
    assetKind: new Map(
      /** @type {[Brand, AssetKind][]} */ ([
        [MNY.brand, AssetKind.NAT],
        [Item.brand, AssetKind.SET],
      ]),
    ),
  };
  const { make: amt } = AmountMath;
  const shared = {
    rxAddr: 'agoric1receiverRose',
    toSend: {
      Pmt: amt(MNY.brand, 3n),
      Inventory: amt(Item.brand, harden(['map'])),
    },
  };

  const wallet = {
    pete: await walletFactory.makeSmartWallet('agoric1payerPete'),
    rose: await walletFactory.makeSmartWallet(shared.rxAddr),
  };
  await E(wallet.pete.deposit).receive(
    MNY.mint.mintPayment(amt(MNY.brand, 10n)),
  );
  await E(wallet.pete.deposit).receive(
    Item.mint.mintPayment(amt(Item.brand, harden(['potion', 'map']))),
  );

  await Promise.all([
    payerPete(t, { wallet: wallet.pete }, wellKnown, shared),
    receiverRose(t, { wallet: wallet.rose }, wellKnown, shared),
  ]);
});

test('send invitation* from contract using publicFacet of postalSvc', async t => {
  const { powers: p0, bundles } = await bootAndInstallBundles(t, bundleRoots);
  /** @type { typeof p0 & import('../src/start-postalSvc.js').PostalSvcPowers} */
  // @ts-expect-error bootstrap powers evolve with BLD staker governance
  const powers = p0;

  const bundleID = getBundleId(bundles.postalSvc);
  await startPostalSvc(powers, { options: { postalSvc: { bundleID } } });

  const { zoe, namesByAddressAdmin, chainStorage } = powers.consume;
  const smartWalletIssuers = {
    Invitation: await E(zoe).getInvitationIssuer(),
    IST: await E(zoe).getFeeIssuer(),
  };

  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    smartWalletIssuers,
  );
  const instance = await powers.instance.consume.postalSvc;

  const shared = {
    rxAddr: 'agoric1receiverRex',
    toSend: {
      ToDoNothing: AmountMath.make(
        await powers.brand.consume.Invitation,
        harden([]),
      ),
    },
  };

  const wallet = await walletFactory.makeSmartWallet(shared.rxAddr);
  const terms = { postalSvc: instance, destAddr: shared.rxAddr };
  await Promise.all([
    senderContract(t, { zoe, terms }),
    receiverRex(t, { wallet }, shared),
  ]);
});

test.todo('partial failure: send N+1 payments where >= 1 delivery fails');
