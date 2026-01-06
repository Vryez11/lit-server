import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

/**
 * 트리거에 맞는 정책 조회 후 쿠폰 자동 발급
 * @param {Object} params
 * @param {string} params.customerId - 발급 대상 고객 ID
 * @param {string|null} params.storeId - 매장 ID (없으면 NULL 정책만 조회)
 * @param {string} params.trigger - auto_issue_on 값 (signup|reservation_completed|checkin_completed|manual_claim)
 * @param {string|null} params.reservationId - 중복 발급 방지를 위한 예약 ID (선택)
 * @returns {Promise<Array<string>>} 생성된 쿠폰 ID 목록
 */
export const issueCouponsForTrigger = async ({ customerId, storeId = null, trigger, reservationId = null }) => {
  if (!customerId || !trigger) return [];

  const params = [trigger];
  let where = 'auto_issue_on = ? AND enabled = 1';
  if (storeId) {
    where += ' AND (store_id IS NULL OR store_id = ?)';
    params.push(storeId);
  } else {
    where += ' AND store_id IS NULL';
  }

  const policies = await query(`SELECT * FROM coupon_policies WHERE ${where}`, params);
  if (!policies || policies.length === 0) return [];

  const createdIds = [];

  for (const policy of policies) {
    // 예약 단위로 한 번만 발급 (type 기준) — 정책 ID를 저장하지 않으므로 최소한 예약 중복을 방지
    if (reservationId) {
      const dup = await query(
        `SELECT id FROM coupons WHERE reservation_id = ? AND type = ? LIMIT 1`,
        [reservationId, policy.type]
      );
      if (dup && dup.length > 0) continue;
    }

    const couponId = `coup_${uuidv4()}`;
    await query(
      `INSERT INTO coupons (
         id, customer_id, store_id, type, title, description,
         discount_amount, discount_rate, min_spend, max_discount,
         benefit_item, benefit_value, status, issued_at, expires_at,
         used_at, reservation_id, payment_id, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY),
         NULL, ?, NULL, NOW(), NOW()
       )`,
      [
        couponId,
        customerId,
        policy.store_id,
        policy.type,
        policy.name || '쿠폰',
        null,
        policy.discount_amount,
        policy.discount_rate,
        policy.min_spend,
        policy.max_discount,
        policy.benefit_item,
        policy.benefit_value,
        policy.validity_days || 7,
        reservationId,
      ]
    );
    createdIds.push(couponId);
  }

  return createdIds;
};
