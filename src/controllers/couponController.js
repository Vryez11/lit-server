/**
 * 고객 쿠폰 컨트롤러
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { success, error } from '../utils/response.js';

const ALLOWED_TYPES = ['payment_discount', 'store_benefit'];
const ALLOWED_STATUS = ['active', 'used', 'expired'];

const nowMySQL = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const addDays = (days = 7) => {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const mapCoupon = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  storeId: row.store_id,
  type: row.type,
  title: row.title,
  description: row.description,
  discountAmount: row.discount_amount,
  discountRate: row.discount_rate,
  minSpend: row.min_spend,
  maxDiscount: row.max_discount,
  benefitItem: row.benefit_item,
  benefitValue: row.benefit_value,
  status: row.status,
  issuedAt: row.issued_at,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
  reservationId: row.reservation_id,
  paymentId: row.payment_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * 쿠폰 발급 (수동 클레임/정책 없이 직접 발급)
 */
export const claimCoupon = async (req, res) => {
  try {
    const customerId = req.customerId || req.body.customerId;
    const {
      type,
      storeId = null,
      title,
      description = null,
      discountAmount = null,
      discountRate = null,
      minSpend = null,
      maxDiscount = null,
      benefitItem = null,
      benefitValue = null,
      validityDays = 7,
    } = req.body;

    if (!customerId || !type) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '필수 정보가 누락되었습니다', { required: ['customerId', 'type'] }));
    }

    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json(error('VALIDATION_ERROR', '유효하지 않은 쿠폰 유형입니다', { allowed: ALLOWED_TYPES }));
    }

    const couponId = `coup_${uuidv4()}`;
    const issuedAt = nowMySQL();
    const expiresAt = addDays(validityDays || 7);
    const couponTitle = title || (type === 'payment_discount' ? '할인 쿠폰' : '매장 혜택 쿠폰');

    await query(
      `INSERT INTO coupons (
         id, customer_id, store_id, type, title, description,
         discount_amount, discount_rate, min_spend, max_discount,
         benefit_item, benefit_value, status, issued_at, expires_at,
         used_at, reservation_id, payment_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL, NULL, NOW(), NOW())`,
      [
        couponId,
        customerId,
        storeId,
        type,
        couponTitle,
        description,
        discountAmount,
        discountRate,
        minSpend,
        maxDiscount,
        benefitItem,
        benefitValue,
        issuedAt,
        expiresAt,
      ]
    );

    const [created] = await query(`SELECT * FROM coupons WHERE id = ?`, [couponId]);
    return res.status(201).json(success(mapCoupon(created), '쿠폰이 발급되었습니다'));
  } catch (err) {
    console.error('[claimCoupon] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 쿠폰 목록 조회 (필터 + 페이지)
 */
export const listCoupons = async (req, res) => {
  try {
    const customerId = req.customerId || req.query.customerId;
    if (!customerId) {
      return res.status(400).json(error('VALIDATION_ERROR', 'customerId가 필요합니다'));
    }

    const { status, type, storeId, page = 1, limit = 20 } = req.query;
    const filters = ['customer_id = ?'];
    const params = [customerId];

    if (status) {
      filters.push('status = ?');
      params.push(status);
    }
    if (type) {
      filters.push('type = ?');
      params.push(type);
    }
    if (storeId) {
      filters.push('store_id = ?');
      params.push(storeId);
    }

    const where = `WHERE ${filters.join(' AND ')}`;
    const offset = (Number(page) - 1) * Number(limit);

    const totalRows = await query(`SELECT COUNT(*) as cnt FROM coupons ${where}`, params);
    const total = totalRows[0]?.cnt || 0;

    const rows = await query(
      `SELECT * FROM coupons ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    const items = rows.map(mapCoupon);
    return res.status(200).json(
      success({
        items,
        page: Number(page),
        limit: Number(limit),
        total,
      })
    );
  } catch (err) {
    console.error('[listCoupons] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 쿠폰 상세
 */
export const getCoupon = async (req, res) => {
  try {
    const customerId = req.customerId;
    const { id } = req.params;

    const [row] = await query(`SELECT * FROM coupons WHERE id = ?`, [id]);
    if (!row) {
      return res.status(404).json(error('NOT_FOUND', '쿠폰을 찾을 수 없습니다'));
    }
    if (customerId && row.customer_id !== customerId) {
      return res.status(403).json(error('FORBIDDEN', '본인 쿠폰이 아닙니다'));
    }

    return res.status(200).json(success(mapCoupon(row)));
  } catch (err) {
    console.error('[getCoupon] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 쿠폰 통계
 */
export const getCouponStats = async (req, res) => {
  try {
    const customerId = req.customerId || req.query.customerId;
    if (!customerId) {
      return res.status(400).json(error('VALIDATION_ERROR', 'customerId가 필요합니다'));
    }

    const rows = await query(
      `SELECT status, COUNT(*) as cnt FROM coupons WHERE customer_id = ? GROUP BY status`,
      [customerId]
    );
    const stats = { activeCount: 0, usedCount: 0, expiredCount: 0 };
    rows.forEach((r) => {
      if (r.status === 'active') stats.activeCount = r.cnt;
      if (r.status === 'used') stats.usedCount = r.cnt;
      if (r.status === 'expired') stats.expiredCount = r.cnt;
    });

    return res.status(200).json(success(stats));
  } catch (err) {
    console.error('[getCouponStats] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 서비스형 쿠폰 사용 (고객이 직접 사용 처리)
 */
export const useCoupon = async (req, res) => {
  try {
    const customerId = req.customerId;
    const { id } = req.params;
    const { storeId: requestStoreId } = req.body || {};

    if (!customerId) {
      return res.status(401).json(error('AUTH_REQUIRED', '로그인이 필요합니다'));
    }

    const [coupon] = await query(`SELECT * FROM coupons WHERE id = ?`, [id]);
    if (!coupon) {
      return res.status(404).json(error('NOT_FOUND', '쿠폰을 찾을 수 없습니다'));
    }
    if (coupon.customer_id !== customerId) {
      return res.status(403).json(error('FORBIDDEN', '본인 쿠폰이 아닙니다'));
    }
    if (coupon.status !== 'active') {
      return res.status(400).json(error('INVALID_STATE', '이미 사용되었거나 만료된 쿠폰입니다'));
    }

    const now = new Date();
    const expires = coupon.expires_at ? new Date(coupon.expires_at) : null;
    if (expires && expires < now) {
      await query(`UPDATE coupons SET status = 'expired', updated_at = NOW() WHERE id = ?`, [id]);
      return res.status(400).json(error('EXPIRED', '만료된 쿠폰입니다'));
    }

    if (coupon.store_id && requestStoreId && coupon.store_id !== requestStoreId) {
      return res.status(400).json(error('STORE_MISMATCH', '해당 매장에서만 사용 가능합니다'));
    }

    await query(
      `UPDATE coupons
         SET status = 'used',
             used_at = NOW(),
             updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    const [updated] = await query(`SELECT * FROM coupons WHERE id = ?`, [id]);
    return res.status(200).json(success(mapCoupon(updated), '쿠폰이 사용 처리되었습니다'));
  } catch (err) {
    console.error('[useCoupon] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 만료 처리 (필요시 호출)
 */
export const expireCouponIfNeeded = async (couponId) => {
  const [coupon] = await query(`SELECT id, expires_at, status FROM coupons WHERE id = ?`, [couponId]);
  if (!coupon) return null;
  if (coupon.status !== 'active') return coupon.status;
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    await query(`UPDATE coupons SET status = 'expired', updated_at = NOW() WHERE id = ?`, [couponId]);
    return 'expired';
  }
  return coupon.status;
};
