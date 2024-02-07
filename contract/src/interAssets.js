// @ts-check
import { E } from '@endo/far';
import { ToFarFunction } from '@endo/captp';
import { makePromiseKit } from '@endo/promise-kit';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { provide } from '@agoric/vat-data';
import { AmountMath, AssetKind } from '@agoric/ertp/src/amountMath.js';
import { makeRatio } from '@agoric/zoe/src/contractSupport/index.js';

import { whenQuiescent } from './when-quiescent.js';

console.log('TODO: createPriceFeed from price-feed-proposal');
console.log('TODO: ensureOracleBrands from price-feed-proposal');
console.log('TODO: scaledPriceAuthority - or skip it?');

console.log('TODO: startPSM');

/**
 * @typedef {{
 *   startUpgradable: StartUpgradable
 * }} UpgradeTools
 */

export const oracleBrandFeedName = (inBrandName, outBrandName) =>
  `${inBrandName}-${outBrandName} price feed`;

/**
 * @param {ZCF<{ agoricNames: NameHub }>} zcf
 * @param {{
 *   tools: UpgradeTools,
 *   chainTimerService: ERef<import('@agoric/time/src/types').TimerService>,
 *   contractAdmin: {
 *     reserve: import('./inter-types').ReserveCreator,
 *     vaultFactory: import('./inter-types').VaultFactoryCreator,
 *     auctioneer: GovernanceFacetKit<import('@agoric/inter-protocol/src/auction/auctioneer').start>['creatorFacet'],
 *   },
 *   nameAdmin: {
 *     issuer: import('@agoric/vats/src/types').NameAdmin,
 *     brand: import('@agoric/vats/src/types').NameAdmin,
 *   },
 *   bankManager: BankManager,
 * }} privateArgs
 *
 * @param {import('@agoric/vat-data').Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  /** @type {import('@agoric/zone').Zone} */
  const zone = makeDurableZone(baggage);
  const { agoricNames } = zcf.getTerms();
  const { tools, contractAdmin, nameAdmin, bankManager, chainTimerService } =
    privateArgs;

  const installation = {
    /** @type {Promise<Installation<import('@agoric/vats/src/mintHolder').prepare>>} */
    mintHolder: E(agoricNames).lookup('installation', 'mintHolder'),
  };

  const lookupInstance = name => E(agoricNames).lookup('instance', name);

  /**
   * @param {string} name
   * @param {{ issuer: Issuer, brand: Brand}} kit
   */
  const publishAsset = (name, { issuer, brand }) =>
    Promise.all([
      E(nameAdmin.issuer).update(name, issuer),
      E(nameAdmin.brand).update(name, brand),
    ]);

  const stable = await E(agoricNames).lookup('brand', 'IST');

  /** @type {import('./inter-types').VaultManagerParamValues} */
  const initialVaultParams = {
    debtLimit: AmountMath.make(stable, 1_000n * 1_000_000n),
    interestRate: makeRatio(1n, stable),
    liquidationPadding: makeRatio(25n, stable),
    liquidationMargin: makeRatio(150n, stable),
    mintFee: makeRatio(50n, stable, 10_000n),
    liquidationPenalty: makeRatio(1n, stable),
  };

  const makeInterAssetKit = zone.exoClassKit(
    'InterAsset',
    undefined, // TODO: interface guards
    () => ({}),
    {
      creator: {
        /**
         * @param {Pick<import('./inter-types').InterchainAssetOptions,
         *  'keyword' | 'issuerName' | 'decimalPlaces'>} assetOpts
         * @returns {Promise<Exclude<IssuerKit<'nat'>, 'mintRecoveryPurse'>>}
         */
        async startMintHolder(assetOpts) {
          const { keyword, issuerName = keyword, decimalPlaces } = assetOpts;
          /** @type {DisplayInfo<'nat'>} */
          const displayInfo = {
            decimalPlaces,
            assetKind: AssetKind.NAT,
          };
          const terms = {
            keyword: issuerName, // "keyword" is a misnomer in mintHolder terms
            assetKind: AssetKind.NAT,
            displayInfo,
          };

          const facets = await E(tools).startUpgradable({
            installation: installation.mintHolder,
            label: issuerName,
            privateArgs: undefined,
            terms,
          });
          const { creatorFacet: mint, publicFacet: issuer } = facets;
          const brand = await E(issuer).getBrand();

          // @ts-expect-error AssetKind NAT guaranteed by construction
          return { mint, issuer, brand, displayInfo };
        },

        /** @param {import('./inter-types').InterchainAssetOptions} assetOpts */
        async makeVBankAsset(assetOpts) {
          const {
            keyword,
            issuerName = keyword,
            proposedName = issuerName,
            denom,
          } = assetOpts;
          const { creator } = this.facets;
          const { mint, issuer, brand } =
            await creator.startMintHolder(assetOpts);
          const kit = { mint, issuer, brand };

          await Promise.all([
            E(bankManager).addAsset(denom, issuerName, proposedName, kit),
            E(contractAdmin.reserve).addIssuer(issuer, keyword),
            publishAsset(issuerName, { issuer, brand }),
          ]);
          return harden({ issuer, brand });
        },

        /** @param {import('./inter-types').InterchainAssetOptions} assetOpts */
        async addVaultCollateral(assetOpts) {
          const {
            keyword,
            issuerName = keyword,
            oracleBrand = issuerName,
          } = assetOpts;
          const { creator } = this.facets;
          const { issuer: interchainIssuer } =
            await creator.makeVBankAsset(assetOpts);

          // don't add the collateral offering to vaultFactory until its price feed is available
          // eslint-disable-next-line no-restricted-syntax -- allow this computed property
          await lookupInstance(oracleBrandFeedName(oracleBrand, 'USD'));

          const auctioneerCreator = contractAdmin.auctioneer;
          const schedules = await E(auctioneerCreator).getSchedule();

          const finishPromiseKit = makePromiseKit();
          const addBrandThenResolve = ToFarFunction(
            'addBrandThenResolve',
            async () => {
              await E(auctioneerCreator).addBrand(interchainIssuer, keyword);
              finishPromiseKit.resolve(undefined);
            },
          );

          // schedules actions on a timer (or does it immediately).
          // finishPromiseKit signals completion.
          void whenQuiescent(schedules, chainTimerService, addBrandThenResolve);
          await finishPromiseKit.promise;

          await E(contractAdmin.vaultFactory).addVaultType(
            interchainIssuer,
            keyword,
            initialVaultParams,
          );
        },
      },
      public: {},
    },
  );
  const kit = provide(baggage, 'interAssetKit', makeInterAssetKit);
  return kit;
};
