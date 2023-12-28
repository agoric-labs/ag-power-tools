// @ts-check
import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makeNameHubKit, makePromiseSpace } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';

export const getBundleId = b => `b1-${b.endoZipBase64Sha512}`;

export const makeBootstrapPowers = async (
  log,
  spaceNames = ['installation', 'instance', 'issuer', 'brand'],
) => {
  const { produce, consume } = makePromiseSpace();

  const { admin, vatAdminState } = makeFakeVatAdmin();
  const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest(admin);
  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const feeIssuer = await E(zoe).getFeeIssuer();
  const [invitationBrand, feeBrand] = await Promise.all(
    [invitationIssuer, feeIssuer].map(i => E(i).getBrand()),
  );

  const { nameHub: agoricNames, nameAdmin: agoricNamesAdmin } =
    makeNameHubKit();
  const spaces = await makeWellKnownSpaces(agoricNamesAdmin, log, spaceNames);

  const { nameHub: namesByAddress, nameAdmin: namesByAddressAdmin } =
    makeNameHubKit();

  const chainTimerService = buildManualTimer();
  const timerBrand = await E(chainTimerService).getTimerBrand();

  const { rootNode: chainStorage, data } = makeFakeStorageKit('published');

  produce.zoe.resolve(zoe);
  produce.feeMintAccess.resolve(feeMintAccess);
  produce.agoricNames.resolve(agoricNames);
  produce.namesByAddress.resolve(namesByAddress);
  produce.namesByAddressAdmin.resolve(namesByAddressAdmin);
  produce.chainTimerService.resolve(chainTimerService);
  produce.chainStorage.resolve(chainStorage);
  spaces.brand.produce.timer.resolve(timerBrand);
  spaces.brand.produce.IST.resolve(feeBrand);
  spaces.brand.produce.Invitation.resolve(invitationBrand);
  spaces.issuer.produce.IST.resolve(feeIssuer);
  spaces.issuer.produce.Invitation.resolve(invitationIssuer);

  /**
   * @type {BootstrapPowers & {
   *   consume: { chainStorage: Promise<StorageNode> },
   *   brand: { consume: Record<string, Promise<Brand>> }
   * }}}
   */
  // @ts-expect-error mock
  const powers = { produce, consume, ...spaces };

  return { powers, vatAdminState, vstorageState: data };
};

export const makeBundleCacheContext = async (_t, dest = 'bundles/') => {
  const bundleCache = await makeNodeBundleCache(dest, {}, s => import(s));

  const shared = {};
  return { bundleCache, shared };
};

export const bootAndInstallBundles = async (t, bundleRoots) => {
  t.log('bootstrap');
  const { powers, vatAdminState } = await makeBootstrapPowers(t.log);

  const { bundleCache } = t.context;
  /** @type {Record<string, *>} */
  const bundles = {};
  for (const [name, rootModulePath] of Object.entries(bundleRoots)) {
    const bundle = await bundleCache.load(rootModulePath, name);
    const bundleID = getBundleId(bundle);
    t.log('publish bundle', name, bundleID.slice(0, 8));
    vatAdminState.installBundle(bundleID, bundle);
    bundles[name] = bundle;
  }
  return { powers, bundles };
};
