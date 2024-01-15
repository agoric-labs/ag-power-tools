// @ts-check
import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { allValues, mapValues } from '../src/objectTools.js';
export { allValues, mapValues };

const { values } = Object;

/**
 * @param {{
 *   zoe: ERef<ZoeService>;
 *   chainStorage: ERef<StorageNode>;
 *   namesByAddressAdmin: ERef<import('@agoric/vats').NameAdmin>;
 * }} powers
 *
 * @typedef {import('@agoric/smart-wallet').OfferSpec} OfferSpec
 *
 * @typedef {Awaited<ReturnType<Awaited<ReturnType<typeof mockWalletFactory>['makeSmartWallet']>>>} MockWallet
 */
export const mockWalletFactory = (
  { zoe, namesByAddressAdmin },
  issuerKeywordRecord,
) => {
  const DEPOSIT_FACET_KEY = 'depositFacet';

  const { Fail, quote: q } = assert;

  //   const walletsNode = E(chainStorage).makeChildNode('wallet');

  // TODO: provideSmartWallet
  /** @param {string} address */
  const makeSmartWallet = async address => {
    const { nameAdmin: addressAdmin } = await E(
      namesByAddressAdmin,
    ).provideChild(address, [DEPOSIT_FACET_KEY]);

    const entries = await Promise.all(
      values(issuerKeywordRecord).map(async issuer => {
        const purse = await E(issuer).makeEmptyPurse();
        const brand = await E(issuer).getBrand();
        /** @type {[Brand, Purse]} */
        const entry = [brand, purse];
        return entry;
      }),
    );
    const purseByBrand = new Map(entries);
    const invitationBrand = await E(E(zoe).getInvitationIssuer()).getBrand();
    purseByBrand.has(invitationBrand) ||
      Fail`no invitation issuer / purse / brand`;
    const invitationPurse = purseByBrand.get(invitationBrand);
    assert(invitationPurse);

    const depositFacet = Far('DepositFacet', {
      /** @param {Payment} pmt */
      receive: async pmt => {
        const pBrand = await E(pmt).getAllegedBrand();
        if (!purseByBrand.has(pBrand))
          throw Error(`brand not known/supported: ${pBrand}`);
        const purse = purseByBrand.get(pBrand);
        assert(purse);
        return E(purse).deposit(pmt);
      },
    });
    await E(addressAdmin).default(DEPOSIT_FACET_KEY, depositFacet);

    /** @param {ERef<Issuer>} issuer */
    const addIssuer = async issuer => {
      const brand = await E(issuer).getBrand();
      if (purseByBrand.has(brand)) {
        throw Error(`brand already present`);
      }
      const purse = await E(issuer).makeEmptyPurse();
      purseByBrand.set(brand, purse);
    };

    // const updatesNode = E(walletsNode).makeChildNode(address);
    // const currentNode = E(updatesNode).makeChildNode('current');

    const getContractInvitation = invitationSpec => {
      const {
        instance,
        publicInvitationMaker,
        invitationArgs = [],
      } = invitationSpec;
      const pf = E(zoe).getPublicFacet(instance);
      return E(pf)[publicInvitationMaker](...invitationArgs);
    };

    const getPurseInvitation = async invitationSpec => {
      //   const { instance, description } = invitationSpec;
      const invitationAmount = await E(invitationPurse).getCurrentAmount();
      console.log(
        '@@TODO: check invitation amount against instance',
        invitationAmount,
      );
      return E(invitationPurse).withdraw(invitationAmount);
    };

    const offerToInvitationMakers = new Map();
    const getContinuingInvitation = async spec => {
      const { previousOffer, invitationMakerName, invitationArgs = [] } = spec;
      const makers =
        offerToInvitationMakers.get(previousOffer) ||
        Fail`${previousOffer} not found`;
      return E(makers)[invitationMakerName](...invitationArgs);
    };
    const seatById = new Map();
    const tryExit = id =>
      E(seatById.get(id) || Fail`${id} not found`).tryExit();
    /** @param {OfferSpec} offerSpec */
    async function* executeOffer(offerSpec) {
      const { invitationSpec, proposal = {}, offerArgs } = offerSpec;
      const { source } = invitationSpec;
      const getter =
        {
          contract: getContractInvitation,
          purse: getPurseInvitation,
          continuing: getContinuingInvitation,
        }[source] || Fail`unsupported source: ${source}`;
      const invitation = await getter(invitationSpec);
      const pmts = await allValues(
        mapValues(proposal.give || {}, async amt => {
          const { brand } = amt;
          if (!purseByBrand.has(brand))
            throw Error(`brand not known/supported: ${brand}`);
          const purse = purseByBrand.get(brand);
          assert(purse);
          return E(purse).withdraw(amt);
        }),
      );
      // XXX throwing here is unhandled somehow.
      const seat = await E(zoe).offer(invitation, proposal, pmts, offerArgs);
      seatById.set(offerSpec.id, seat);
      //   console.log(address, offerSpec.id, 'got seat');
      yield { updated: 'offerStatus', status: offerSpec };
      const result0 = await E(seat).getOfferResult();
      const result = typeof result0 === 'object' ? 'UNPUBLISHED' : result0;
      //   console.log(address, offerSpec.id, 'got result', result);
      yield { updated: 'offerStatus', status: { ...offerSpec, result } };
      if (typeof result0 === 'object' && 'invitationMakers' in result0) {
        offerToInvitationMakers.set(offerSpec.id, result0.invitationMakers);
      }
      const [payouts, numWantsSatisfied] = await Promise.all([
        E(seat).getPayouts(),
        E(seat).numWantsSatisfied(),
      ]);
      yield {
        updated: 'offerStatus',
        status: { ...offerSpec, result, numWantsSatisfied },
      };
      const amts = await allValues(
        mapValues(payouts, pmtP =>
          Promise.resolve(pmtP).then(pmt => depositFacet.receive(pmt)),
        ),
      );
      //   console.log(address, offerSpec.id, 'got payouts', amts);
      yield {
        updated: 'offerStatus',
        status: { ...offerSpec, result, numWantsSatisfied, payouts: amts },
      };
    }

    return {
      deposit: depositFacet,
      offers: Far('Offers', { executeOffer, addIssuer, tryExit }),
      peek: Far('Wallet Peek', {
        purseNotifier: brand =>
          E(
            purseByBrand.get(brand) || Fail`${q(brand)}`,
          ).getCurrentAmountNotifier(),
      }),
    };
  };

  return harden({ makeSmartWallet });
};

/**
 * Seat-like API from updates
 * @param {*} updates
 */
export const seatLike = updates => {
  const sync = {
    result: makePromiseKit(),
    payouts: makePromiseKit(),
  };
  (async () => {
    try {
      // XXX an error here is somehow and unhandled rejection
      for await (const update of updates) {
        if (update.updated !== 'offerStatus') continue;
        const { result, payouts } = update.status;
        if ('result' in update.status) sync.result.resolve(result);
        if ('payouts' in update.status) sync.payouts.resolve(payouts);
      }
    } catch (reason) {
      sync.result.reject(reason);
      sync.payouts.reject(reason);
      throw reason;
    }
  })();
  return harden({
    getOfferResult: () => sync.result.promise,
    getPayouts: () => sync.payouts.promise,
  });
};

export const makeWalletFactory = async (
  { zoe, namesByAddressAdmin, chainStorage },
  issuers,
) => {
  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    { Invitation: invitationIssuer, ...issuers },
  );
  return walletFactory;
};
