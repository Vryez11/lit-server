/**
 * ?•ì‚° ë°°ì¹˜ ?¤í–‰ ?¤í¬ë¦½íŠ¸
 *
 * ?¬ìš©ë²?
 *   node src/jobs/runSettlement.js                    # ?´ì œ 00:00 ~ ?¤ëŠ˜ 00:00
 *   node src/jobs/runSettlement.js --dry-run          # ?œë??ˆì´??(DB ë°˜ì˜ ?ˆí•¨)
 *   node src/jobs/runSettlement.js --start 2025-01-01 --end 2025-01-02
 *
 * Render Cron Jobs ?¤ì • ?ˆì‹œ:
 *   - ë§¤ì¼ ?ˆë²½ 2?? 0 2 * * * node src/jobs/runSettlement.js
 */

import { runSettlementPeriod } from '../services/settlementService.js';
import { getYesterdayPeriod } from '../utils/settlementPeriod.js';

/**
 * ì»¤ë§¨?œë¼???¸ì ?Œì‹±
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    startDate: null,
    endDate: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--start' && args[i + 1]) {
      options.startDate = args[i + 1];
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      options.endDate = args[i + 1];
      i++;
    }
  }

  return options;
}

/**
 * ? ì§œ ë¬¸ì?´ì„ Date ê°ì²´ë¡?ë³€?? * @param {string} dateStr - YYYY-MM-DD ?•ì‹
 * @returns {Date}
 */
function parseDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`? íš¨?˜ì? ?Šì? ? ì§œ ?•ì‹: ${dateStr}`);
  }
  return date;
}

/**
 * ë©”ì¸ ?¤í–‰ ?¨ìˆ˜
 */
async function main() {

  try {
    const options = parseArgs();

    let periodStart, periodEnd;

    // ? ì§œ ?¸ìê°€ ?ˆìœ¼ë©??¬ìš©, ?†ìœ¼ë©??´ì œ ê¸°ê°„ ?¬ìš©
    if (options.startDate && options.endDate) {
      periodStart = parseDate(options.startDate);
      periodEnd = parseDate(options.endDate);
    } else {
      const period = getYesterdayPeriod();
      periodStart = period.periodStart;
      periodEnd = period.periodEnd;
        `?“… ?´ì œ ê¸°ê°„: ${periodStart.toISOString().split('T')[0]} ~ ${periodEnd.toISOString().split('T')[0]}`
      );
    }

    if (options.dryRun) {
    }


    const result = await runSettlementPeriod({
      periodStart,
      periodEnd,
      dryRun: options.dryRun,
    });



    if (result.status === 'success' && !options.dryRun) {
    }

    if (result.settlements && result.settlements.length > 0) {
      result.settlements.forEach((s, idx) => {
        if (s.statementId) {
        }
      });
    }


    process.exit(0);
  } catch (error) {
    console.error('\n???•ì‚° ?¤íŒ¨:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ?¤í¬ë¦½íŠ¸ ?¤í–‰
main();
