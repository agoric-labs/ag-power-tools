// @ts-check
import '@endo/init';
import * as fsAmbient from 'fs/promises';
import * as child_processAmbient from 'child_process';
import { makeAgd } from './a3p/agd-lib.js';
import { makeWalletKit, seatLike } from './wallet-kit-agd.js';

const launchConfig = {
  name: 'BRD',
  supplyQty: 1_000_000n,
};

const getBundleID = bundle => `b1-${bundle.endoZipBase64Sha512}`;

/**
 * @param {string[]} args
 * @param {Record<string, string | undefined>} env
 * @param {{
 *   execFileSync?: typeof import('child_process').execFileSync
 *   readFile?: typeof import('fs/promises').readFile
 *   now?: typeof Date.now
 *   delay?: (ms: number) => Promise<void>
 * }} [io]
 */
const main = async (args, env, io = {}) => {
  const {
    execFileSync = child_processAmbient.execFileSync,
    readFile = fsAmbient.readFile,
    now = Date.now,
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = io;
  const { USER1ADDR: addr } = env;
  if (!addr) throw assert.error(`missing $USER1ADDR`);
  const [_node, _script, bundlefn] = args;

  const agd = makeAgd({ execFileSync }).withOpts({ keyringBackend: 'test' });
  const wallet = makeWalletKit(addr, { agd, delay });

  const makeStartOffer = async () => {
    if (!bundlefn) throw assert.error(`Usage: offer-tool bundle-x.json`);

    const bundle = await readFile(bundlefn, 'utf-8').then(txt =>
      JSON.parse(txt),
    );
    const bundleID = getBundleID(bundle);
    const issuerKeywordRecord = {
      Deposit: await wallet.query.lookup('issuer', 'IST'),
    };
    const instance = await wallet.query.lookup('instance', 'contractStarter');
    console.log('instance', instance);
    const { terms } = await wallet.query.boardAux(instance);

    const startOpts = {
      label: `${bundlefn.replace('bundle-', '').split('.')[0]}-launch`,
      bundleID,
      issuerKeywordRecord,
      customTerms: launchConfig,
    };

    const id = `start-${now()}`;
    /** @type {OfferSpec} */
    const offer = {
      id,
      invitationSpec: {
        source: 'contract',
        instance,
        publicInvitationMaker: 'makeStartInvitation',
        invitationArgs: [startOpts],
      },
      proposal: {
        give: { Fee: terms.prices.startInstance },
      },
    };
    return offer;
  };

  const makeReserveAddOffer = async (brandName = 'IST', qty = 1n) => {
    const id = `reserve-add-${now()}`;

    const make = (brand, value) => harden({ brand, value });
    const brand = await wallet.query.lookup('brand');
    const amount = make(brand[brandName], BigInt(qty) * 1_000_000n);
    const give = { Collateral: amount };

    /** @type {OfferSpec} */
    const offerSpec = {
      id,
      invitationSpec: {
        source: 'agoricContract',
        instancePath: ['reserve'],
        callPipe: [['makeAddCollateralInvitation', []]],
      },
      proposal: { give },
    };
    return offerSpec;
  };

  const offer = await makeReserveAddOffer();

  if (args.includes('--generate-only')) {
    const action = wallet.offers.formatAction(offer);
    console.log(action);
    return;
  }

  console.log({ offerId: offer.id });
  const { tx, updates } = await wallet.offers.executeOffer(offer);
  const { height, txhash, code } = tx;
  const txInfo = { offerId: offer.id, height, txhash, code };
  console.log(txInfo);
  const seat = seatLike(updates);
  const result = await seat.getOfferResult();
  console.log({ ...txInfo, result });
  const payouts = await seat.getPayouts();
  console.log({ ...txInfo, payouts, result });
};

await main(process.argv, process.env).catch(err => console.error(err));
