/**
 * 정산 기간 헬퍼
 * 기본: "어제 00:00 ~ 오늘 00:00" (서버 타임존 기준; 보통 Asia/Seoul로 설정)
 */

/**
 * 어제의 정산 기간을 반환
 * @returns {Object} { periodStart: Date, periodEnd: Date }
 */
export function getYesterdayPeriod() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 오늘 00:00
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000); // 어제 00:00

  return {
    periodStart: yesterdayStart,
    periodEnd: todayStart,
  };
}
