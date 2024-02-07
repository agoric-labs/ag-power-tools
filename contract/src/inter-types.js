// @ts-check
export {};

/**
 * @typedef {object} VaultManagerParamValues
 * @property {Ratio} liquidationMargin - margin below which collateral will be
 *   liquidated to satisfy the debt.
 * @property {Ratio} liquidationPenalty - penalty charged upon liquidation as
 *   proportion of debt
 * @property {Ratio} interestRate - annual interest rate charged on debt
 *   positions
 * @property {Ratio} mintFee - The fee (in BasisPoints) charged when creating or
 *   increasing a debt position.
 * @property {Amount<'nat'>} debtLimit
 * @property {Ratio} [liquidationPadding] - vault must maintain this in order to
 *   remove collateral or add debt
 */

/**
 * @typedef {object} InterchainAssetOptions
 * @property {string} denom
 * @property {number} decimalPlaces
 * @property {string} keyword - used in regstering with reserve, vaultFactory
 * @property {string} [issuerName] - used in agoricNames for compatibility:
 *   defaults to `keyword` if not provided
 * @property {string} [proposedName] - defaults to `issuerName` if not provided
 * @property {string} [oracleBrand] - defaults to `issuerName` if not provided
 */

/**
 * @typedef {{
 *  addIssuer: (issuer: Issuer, keyword: string) => Promise<void>
 * }} ReserveCreator
 */

/**
 * @typedef {{
 *   addVaultType(collateralIssuer: Issuer<'nat'>, collateralKeyword: Keyword, initialParamValues: VaultManagerParamValues)
 * }} VaultFactoryCreator
 */
