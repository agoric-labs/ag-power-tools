// @ts-check
import { mustMatch } from '@endo/patterns';

/**
 * meta.customTermsShape doesn't seem to work.
 *
 * @template CT
 * @param {ZCF<CT>} zcf
 * @param {import('./types').ContractMeta} meta
 * @returns {CT & StandardTerms}
 */
export const getTerms = (zcf, meta) => {
  const terms = zcf.getTerms();
  const { customTermsShape } = meta;
  if (customTermsShape) {
    const { issuers: _i, brands: _b, ...customTerms } = terms;
    mustMatch(harden(customTerms), customTermsShape);
  }
  return terms;
};
