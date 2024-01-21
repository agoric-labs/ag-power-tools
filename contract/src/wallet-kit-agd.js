// @ts-check
import { makePromiseKit } from '@endo/promise-kit';
import { makeClientMarshaller } from './marshalTables.js';

/** @typedef {import('@agoric/smart-wallet/src/offers.js').OfferSpec} OfferSpec */
/** @typedef {import('@agoric/smart-wallet/src/smartWallet').BridgeAction} BridgeAction */

const { fromEntries } = Object;

export const bigIntReplacer = (k, v) => (typeof v === 'bigint' ? String(v) : v);

/**
 * @param {string} addr
 * @param {{
 *   agd: ReturnType<import('./a3p/agd-lib').makeAgd>
 *   blkdur?: number
 *   delay: (ms: number) => Promise<void>
 *   chainId?: string
 * }} opts
 */
export const makeWalletKit = (addr, opts) => {
  const { agd, delay, chainId = 'agoriclocal', blkdur = 1 } = opts;
  const m = makeClientMarshaller();

  /**
   * @param {string} path
   */
  const queryData = async path => {
    const { value } = await agd.query(['vstorage', 'data', path]);
    const { values } = JSON.parse(value);
    const capData = JSON.parse(values.at(-1));
    const it = m.fromCapData(capData);
    return it;
  };

  /**
   * @param {string} path
   */
  async function* queryDataIter(path) {
    const { value } = await agd.query(['vstorage', 'data', path]);
    const { values } = JSON.parse(value);
    for (const val of values) {
      const capData = JSON.parse(val);
      const it = m.fromCapData(capData);
      yield it;
    }
  }

  const lookup = async (kind, name) => {
    const entries = await queryData(`published.agoricNames.${kind}`);
    const record = fromEntries(entries);
    // console.log('lookup', kind, name, record, record[name]);
    if (!name) return record;
    if (!(name in record)) throw Error(`${name} not found`);
    return record[name];
  };

  const boardAux = async it => {
    const {
      slots: [boardId],
    } = m.toCapData(it);
    return queryData(`published.boardAux.${boardId}`);
  };

  /**
   * @param {OfferSpec} offer
   */
  const formatAction = offer => {
    const action = harden({ method: 'executeOffer', offer });
    return JSON.stringify(m.toCapData(action));
  };

  /**
   * @param {OfferSpec} offer
   * @param {number | 'auto'} [fee]
   */
  const sendOffer = async (offer, fee = 'auto') => {
    const actionj = formatAction(offer);
    const trx = await agd.tx(
      ['swingset', 'wallet-action', actionj, '--allow-spend', '--trace'],
      { chainId, from: addr, yes: true },
    );
    // console.log('code', trx.code);
    if (trx.code !== 0) throw Error(trx.rawlog);
    return trx;
  };

  /**
   * @param {string} addr
   * @param {string | number} offerId
   */
  async function* iterateUpdates(addr, offerId) {
    let prev;
    let cur;
    const json = x => JSON.stringify(x, bigIntReplacer);
    let seq = 0;
    do {
      await delay(blkdur * 1000);
      for await (const item of queryDataIter(`published.wallet.${addr}`)) {
        cur = item;
        seq += 1;
        if (json(cur) !== json(prev)) {
          // console.log('update', offerId, seq, cur);
          if (cur?.status?.id !== offerId) continue;
          // console.log('yield update', offerId, seq, cur);
          yield cur;
        }
        prev = cur;
      }
    } while (!cur?.status?.payouts);
  }

  /**
   * @param {OfferSpec} offer
   */
  const executeOffer = async offer => {
    const tx = await sendOffer(offer);
    const updates = iterateUpdates(addr, offer.id);
    return { tx, updates };
  };

  return harden({
    query: { queryData, queryDataIter, lookup, boardAux },
    offers: { executeOffer, sendOffer, iterateUpdates, formatAction },
  });
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
    let seq = 0;
    try {
      // XXX an error here is somehow and unhandled rejection
      for await (const update of updates) {
        // console.log((seq += 1), update);
        if (update.updated !== 'offerStatus') continue;
        const { result, payouts } = update.status;
        if ('result' in update.status) sync.result.resolve(result);
        if ('payouts' in update.status) sync.payouts.resolve(payouts);
        if ('error' in update.status) throw Error(update.status.error);
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
