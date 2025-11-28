/**
 * 정산 배치 실행 스크립트
 *
 * 사용법:
 *   node src/jobs/runSettlement.js                    # 어제 00:00 ~ 오늘 00:00
 *   node src/jobs/runSettlement.js --dry-run          # 시뮬레이션 (DB 반영 안함)
 *   node src/jobs/runSettlement.js --start 2025-01-01 --end 2025-01-02
 *
 * Render Cron Jobs 설정 예시:
 *   - 매일 새벽 2시: 0 2 * * * node src/jobs/runSettlement.js
 */

import { runSettlementPeriod } from '../services/settlementService.js';
import { getYesterdayPeriod } from '../utils/settlementPeriod.js';

/**
 * 커맨드라인 인자 파싱
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
 * 날짜 문자열을 Date 객체로 변환
 * @param {string} dateStr - YYYY-MM-DD 형식
 * @returns {Date}
 */
function parseDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`유효하지 않은 날짜 형식: ${dateStr}`);
  }
  return date;
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('============================================');
  console.log('  정산 배치 작업 시작');
  console.log('============================================\n');

  try {
    const options = parseArgs();

    let periodStart, periodEnd;

    // 날짜 인자가 있으면 사용, 없으면 어제 기간 사용
    if (options.startDate && options.endDate) {
      periodStart = parseDate(options.startDate);
      periodEnd = parseDate(options.endDate);
      console.log(`📅 지정된 기간: ${options.startDate} ~ ${options.endDate}`);
    } else {
      const period = getYesterdayPeriod();
      periodStart = period.periodStart;
      periodEnd = period.periodEnd;
      console.log(
        `📅 어제 기간: ${periodStart.toISOString().split('T')[0]} ~ ${periodEnd.toISOString().split('T')[0]}`
      );
    }

    if (options.dryRun) {
      console.log('🧪 드라이런 모드 (DB 반영 안함)\n');
    }

    console.log('🚀 정산 실행 중...\n');

    const result = await runSettlementPeriod({
      periodStart,
      periodEnd,
      dryRun: options.dryRun,
    });

    console.log('============================================');
    console.log('  정산 결과');
    console.log('============================================\n');

    console.log(`✅ 상태: ${result.status}`);
    console.log(`📊 총 결제 건수: ${result.totalPayments}건`);
    console.log(`📝 생성된 정산서: ${result.totalStatements}개`);

    if (result.status === 'success' && !options.dryRun) {
      console.log(`✔️  성공 결제: ${result.successPaymentCount}건`);
      console.log(`⏭️  스킵 결제: ${result.skippedPaymentCount}건`);
      console.log(`💰 총 지급액: ${result.totalPayout?.toLocaleString()}원`);
      console.log(`💸 총 수수료: ${result.totalCommission?.toLocaleString()}원`);
    }

    if (result.settlements && result.settlements.length > 0) {
      console.log('\n📋 점포별 정산 내역:');
      result.settlements.forEach((s, idx) => {
        console.log(`\n  ${idx + 1}. 점포 ID: ${s.storeId}`);
        if (s.statementId) {
          console.log(`     정산서 ID: ${s.statementId}`);
        }
        console.log(`     총 매출: ${s.totalSales.toLocaleString()}원`);
        console.log(`     수수료: ${s.commissionAmount.toLocaleString()}원`);
        console.log(`     지급액: ${s.payoutAmount.toLocaleString()}원`);
        console.log(`     결제 건수: ${s.paymentsCount}건`);
      });
    }

    console.log('\n============================================');
    console.log('  정산 배치 작업 완료');
    console.log('============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 정산 실패:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 스크립트 실행
main();
