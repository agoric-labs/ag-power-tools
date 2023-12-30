/**
 * @file core eval script* to start the ibcToken contract.
 *
 * * see test-gimix-proposal.js to make a script from this file.
 *
 * The `permit` export specifies the corresponding permit.
 */
// @ts-check

import { E } from '@endo/far';
import { makeMarshal } from '@endo/marshal';

const { Fail } = assert;

const trace = (...args) => console.log('start-ibcToken', ...args);

const fail = msg => {
  throw Error(msg);
};

const evalConfig = {
  tokenKeyword: 'TEST',
  kitName: 'test',
};

/**
 * confrims the provided key:
 *  - starts with a letter or underscore (no leading numbers)
 *  - only contains letters, numbers, or underscores without any whitespace
 * @param {string} key
 * @returns {boolean}
 */
export const isValidKey = key => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key);
assert(isValidKey(evalConfig.kitName), 'evalConfig.kitName is not valid');

const BOARD_AUX = 'boardAux';
const marshalData = makeMarshal(_val => Fail`data only`);

/**
 *
 * @param {ERef<StorageNode>} chainStorage
 * @param {string} boardId
 * @returns {Promise<StorageNode>}
 */
const makeBoardAuxNode = async (chainStorage, boardId) => {
  const boardAux = E(chainStorage).makeChildNode(BOARD_AUX);
  return E(boardAux).makeChildNode(boardId);
};

/**
 * @param {ERef<StorageNode>} chainStorage
 * @param {ERef<import('@agoric/vats').Board>} board
 * @param {ERef<Brand>} brand
 */
const publishBrandInfo = async (chainStorage, board, brand) => {
  const [id, displayInfo, allegedName] = await Promise.all([
    E(board).getId(brand),
    E(brand).getDisplayInfo(),
    E(brand).getAllegedName(),
  ]);
  const node = makeBoardAuxNode(chainStorage, id);
  const aux = marshalData.toCapData(harden({ allegedName, displayInfo }));
  void (await E(node).setValue(JSON.stringify(aux)));
};

/**
 * @param {BootstrapPowers} powers
 * @param {{ options?: {
 *  ibcToken: {
 *    bundleID: string;
 *  };
 *  tokenKeyword: string;
 *  tokenDecimals: number;
 *  proposedName: string;
 *  denom: string;
 * }}} config
 */
export const startIBCToken = async (powers, config) => {
  trace('startIBCToken config', config);
  assert(
    config?.options?.tokenKeyword,
    'tokenKeyword must be provided in config.options',
  );

  const {
    consume: { zoe, bankManager, chainStorage, board, namesByAddressAdmin },
    installation: {
      // @ts-expect-error not statically known at genesis
      produce: { [`${evalConfig.kitName}TokenKit`]: produceInstallation },
    },
    instance: {
      // @ts-expect-error not statically known at genesis
      produce: { [`${evalConfig.kitName}TokenKit`]: produceInstance },
    },
    brand: {
      // @ts-expect-error not statically known at genesis
      produce: { [config.options.tokenKeyword]: produceTokenBrand },
    },
    issuer: {
      // @ts-expect-error not statically known at genesis
      produce: { [config.options.tokenKeyword]: produceTokenIssuer },
    },
  } = powers;
  const { bundleID = fail(`no bundleID`) } = config.options?.ibcToken ?? {};
  // const zone = rootZone.subZone(config.options.tokenKeyword);

  /** @type {Installation<import('./ibcToken').prepare>} */
  const installation = await E(zoe).installBundleID(bundleID);
  produceInstallation.resolve(installation);

  const { instance, creatorFacet } = await E(zoe).startInstance(
    installation,
    undefined,
    {
      tokenDecimals: config.options.tokenDecimals,
      tokenKeyword: config.options.tokenKeyword,
      proposedName: config.options.proposedName,
      denom: config.options.denom,
    },
  );
  produceInstance.resolve(instance);
  trace('ibcToken started');

  const tokenIssuer = await E(creatorFacet).getTokenIssuer();
  const tokenBrand = await E(creatorFacet).getTokenBrand();
  const {
    // issuers: { [config.options.tokenKeyword]: tokenIssuer },
    // brands: { [config.options.tokenKeyword]: tokenBrand },
    tokenKeyword,
    proposedName,
    denom,
  } = await E(zoe).getTerms(instance);

  await publishBrandInfo(chainStorage, board, tokenBrand);
  trace('ibcToken published to boardAux');

  // resolving these publishes into agoricNames for `issuer` and `brand`
  produceTokenBrand.resolve(tokenBrand);
  produceTokenIssuer.resolve(tokenIssuer);
  trace('ibcToken published to agoricNames');

  const tokenKit = await E(creatorFacet).getTokenKit();

  // add to cosmos bank
  assert(proposedName, 'proposedName not provided');
  assert(denom, 'denom not provided');
  await E(bankManager).addAsset(denom, tokenKeyword, proposedName, tokenKit);
  trace('ibcToken added to cosmos bank');
};

// XXX parameterize this with the same config passed to startIBCToken
export const manifest = /** @type {const} */ ({
  [startIBCToken.name]: {
    consume: {
      agoricNames: true,
      bankManager: true,
      namesByAddress: true,
      namesByAddressAdmin: true,
      zoe: true,
    },
    installation: {
      consume: {
        [`${evalConfig.kitName}TokenKit`]: true,
      },
    },
    instance: {
      produce: {
        [`${evalConfig.kitName}TokenKit`]: true,
      },
    },
    brand: {
      produce: {
        [evalConfig.tokenKeyword]: true,
      },
    },
    issuer: {
      produce: {
        [evalConfig.tokenKeyword]: true,
      },
    },
    produce: {
      [`${evalConfig.kitName}TokenKit`]: true,
    },
  },
});

export const permit = JSON.stringify(Object.values(manifest)[0]);

// script completion value
startIBCToken;
