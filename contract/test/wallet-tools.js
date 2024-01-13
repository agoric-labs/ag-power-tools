// @ts-check
import { E, Far } from '@endo/far';

const { entries, fromEntries, values } = Object;

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
export const allValues = async obj => {
  const es = await Promise.all(
    entries(obj).map(async ([k, v]) => [k, await v]),
  );
  return fromEntries(es);
};
/** @type { <V, U, T extends Record<string, V>>(obj: T, f: (v: V) => U) => Record<string, U>} */
export const mapValues = (obj, f) =>
  fromEntries(entries(obj).map(([p, v]) => [p, f(v)]));

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

    /** @param {OfferSpec} offerSpec */
    async function* executeOffer(offerSpec) {
      const { invitationSpec, proposal = {}, offerArgs } = offerSpec;
      const { source } = invitationSpec;
      const invitation = await (source === 'contract'
        ? getContractInvitation(invitationSpec)
        : source === 'purse'
        ? getPurseInvitation(invitationSpec)
        : Fail`unsupported source: ${source}`);
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
      const seat = await E(zoe).offer(invitation, proposal, pmts, offerArgs);
      //   console.log(address, offerSpec.id, 'got seat');
      yield { updated: 'offerStatus', status: offerSpec };
      const result = await E(seat).getOfferResult();
      //   console.log(address, offerSpec.id, 'got result', result);
      yield { updated: 'offerStatus', status: { ...offerSpec, result } };
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
      offers: Far('Offers', { executeOffer, addIssuer }),
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
