// @ts-check

import { TimeMath } from '@agoric/time';
import { E, Far } from '@endo/far';

const { quote: q } = assert;

// wait a short while after end to allow things to settle
const BUFFER = 5n * 60n;
// let's insist on 20 minutes leeway for running the scripts
const COMPLETION = 20n * 60n;

/**
 * This function works around an issue identified in #8307 and #8296, and fixed
 * in #8301. The fix is needed until #8301 makes it into production.
 *
 * If there is a liveSchedule, 1) run now if start is far enough away,
 * otherwise, 2) run after endTime. If neither liveSchedule nor nextSchedule is
 * defined, 3) run now. If there is only a nextSchedule, 4) run now if startTime
 * is far enough away, else 5) run after endTime
 *
 * @param {import('@agoric/inter-protocol/src/auction/scheduler.js').FullSchedule} schedules
 * @param {ERef<import('@agoric/time').TimerService>} timer
 * @param {() => void} thunk
 */
export const whenQuiescent = async (schedules, timer, thunk) => {
  const { nextAuctionSchedule, liveAuctionSchedule } = schedules;
  const now = await E(timer).getCurrentTimestamp();

  const waker = Far('addAssetWaker', { wake: () => thunk() });

  if (liveAuctionSchedule) {
    const safeStart = TimeMath.subtractAbsRel(
      liveAuctionSchedule.startTime,
      COMPLETION,
    );

    if (TimeMath.compareAbs(safeStart, now) < 0) {
      // case 2
      console.warn(
        `Add Asset after live schedule's endtime: ${q(
          liveAuctionSchedule.endTime,
        )}`,
      );

      return E(timer).setWakeup(
        TimeMath.addAbsRel(liveAuctionSchedule.endTime, BUFFER),
        waker,
      );
    }
  }

  if (!liveAuctionSchedule && nextAuctionSchedule) {
    const safeStart = TimeMath.subtractAbsRel(
      nextAuctionSchedule.startTime,
      COMPLETION,
    );
    if (TimeMath.compareAbs(safeStart, now) < 0) {
      // case 5
      console.warn(
        `Add Asset after next schedule's endtime: ${q(
          nextAuctionSchedule.endTime,
        )}`,
      );
      return E(timer).setWakeup(
        TimeMath.addAbsRel(nextAuctionSchedule.endTime, BUFFER),
        waker,
      );
    }
  }

  // cases 1, 3, and 4 fall through to here.
  console.warn(`Add Asset immediately`, thunk);
  return thunk();
};
