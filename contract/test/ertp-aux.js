// @ts-check
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { makeRatio } from '@agoric/zoe/src/contractSupport/ratio.js';

/** @param {Pick<IssuerKit<'nat'>, 'brand' | 'issuer' | 'mint'>} kit */
export const withAmountUtils = kit => {
  const decimalPlaces = kit.issuer.getDisplayInfo?.()?.decimalPlaces ?? 6;
  return {
    ...kit,
    /** @param {NatValue} v */
    make: v => AmountMath.make(kit.brand, v),
    makeEmpty: () => AmountMath.makeEmpty(kit.brand),
    /**
     * @param {NatValue} n
     * @param {NatValue} [d]
     */
    makeRatio: (n, d) => makeRatio(n, kit.brand, d),
    /** @param {number} n */
    units: n =>
      AmountMath.make(kit.brand, BigInt(Math.round(n * 10 ** decimalPlaces))),
  };
};
/** @typedef {ReturnType<typeof withAmountUtils>} AmountUtils */
