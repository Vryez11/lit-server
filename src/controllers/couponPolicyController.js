/**
 * 매장 쿠폰 정책 컨트롤러
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { success, error } from '../utils/response.js';

const ALLOWED_TYPES = ['payment_discount', 'store_benefit'];
const ALLOWED_TRIGGERS = ['manual_claim', 'signup', 'checkin_completed'];

const mapPolicy = (row) => ({
  id: row.id,
  storeId: row.store_id,
  name: row.name,
  type: row.type,
  discountAmount: row.discount_amount,
  discountRate: row.discount_rate,
  minSpend: row.min_spend,
  maxDiscount: row.max_discount,
  benefitItem: row.benefit_item,
  benefitValue: row.benefit_value,
  autoIssueOn: row.auto_issue_on,
  validityDays: row.validity_days,
  enabled: !!row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createPolicy = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      name,
      type,
      discountAmount = null,
      discountRate = null,
      minSpend = null,
      maxDiscount = null,
      benefitItem = null,
      benefitValue = null,
      autoIssueOn = 'manual_claim',
      validityDays = 7,
      enabled = true,
    } = req.body;

    if (!storeId || !name || !type) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '필수 정보가 누락되었습니다', { required: ['name', 'type'] }));
    }
    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json(error('VALIDATION_ERROR', '유효하지 않은 쿠폰 유형입니다', { allowed: ALLOWED_TYPES }));
    }
    if (!ALLOWED_TRIGGERS.includes(autoIssueOn)) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '유효하지 않은 발급 트리거입니다', { allowed: ALLOWED_TRIGGERS }));
    }

    const id = `coup_pol_${uuidv4()}`;

    await query(
      `INSERT INTO coupon_policies (
         id, store_id, name, type,
         discount_amount, discount_rate, min_spend, max_discount,
         benefit_item, benefit_value, auto_issue_on, validity_days, enabled,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        storeId,
        name,
        type,
        discountAmount,
        discountRate,
        minSpend,
        maxDiscount,
        benefitItem,
        benefitValue,
        autoIssueOn,
        validityDays,
        enabled ? 1 : 0,
      ]
    );

    const [row] = await query(`SELECT * FROM coupon_policies WHERE id = ?`, [id]);
    return res.status(201).json(success(mapPolicy(row), '쿠폰 정책이 생성되었습니다'));
  } catch (err) {
    console.error('[createPolicy] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const listPolicies = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { enabled, type, autoIssueOn } = req.query;

    const filters = ['store_id = ?'];
    const params = [storeId];
    if (enabled !== undefined) {
      filters.push('enabled = ?');
      params.push(enabled === 'true' || enabled === '1' ? 1 : 0);
    }
    if (type) {
      filters.push('type = ?');
      params.push(type);
    }
    if (autoIssueOn) {
      filters.push('auto_issue_on = ?');
      params.push(autoIssueOn);
    }

    const rows = await query(
      `SELECT * FROM coupon_policies WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    return res.status(200).json(success(rows.map(mapPolicy)));
  } catch (err) {
    console.error('[listPolicies] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const getPolicy = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const [row] = await query(`SELECT * FROM coupon_policies WHERE id = ?`, [id]);
    if (!row || row.store_id !== storeId) {
      return res.status(404).json(error('NOT_FOUND', '정책을 찾을 수 없습니다'));
    }
    return res.status(200).json(success(mapPolicy(row)));
  } catch (err) {
    console.error('[getPolicy] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const updatePolicy = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const {
      name,
      type,
      discountAmount,
      discountRate,
      minSpend,
      maxDiscount,
      benefitItem,
      benefitValue,
      autoIssueOn,
      validityDays,
      enabled,
    } = req.body;

    const [row] = await query(`SELECT * FROM coupon_policies WHERE id = ?`, [id]);
    if (!row || row.store_id !== storeId) {
      return res.status(404).json(error('NOT_FOUND', '정책을 찾을 수 없습니다'));
    }

    if (type && !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json(error('VALIDATION_ERROR', '유효하지 않은 쿠폰 유형입니다', { allowed: ALLOWED_TYPES }));
    }
    if (autoIssueOn && !ALLOWED_TRIGGERS.includes(autoIssueOn)) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '유효하지 않은 발급 트리거입니다', { allowed: ALLOWED_TRIGGERS }));
    }

    await query(
      `UPDATE coupon_policies
         SET name = COALESCE(?, name),
             type = COALESCE(?, type),
             discount_amount = COALESCE(?, discount_amount),
             discount_rate = COALESCE(?, discount_rate),
             min_spend = COALESCE(?, min_spend),
             max_discount = COALESCE(?, max_discount),
             benefit_item = COALESCE(?, benefit_item),
             benefit_value = COALESCE(?, benefit_value),
             auto_issue_on = COALESCE(?, auto_issue_on),
             validity_days = COALESCE(?, validity_days),
             enabled = COALESCE(?, enabled),
             updated_at = NOW()
       WHERE id = ?`,
      [
        name,
        type,
        discountAmount,
        discountRate,
        minSpend,
        maxDiscount,
        benefitItem,
        benefitValue,
        autoIssueOn,
        validityDays,
        enabled === undefined ? null : enabled ? 1 : 0,
        id,
      ]
    );

    const [updated] = await query(`SELECT * FROM coupon_policies WHERE id = ?`, [id]);
    return res.status(200).json(success(mapPolicy(updated), '정책이 수정되었습니다'));
  } catch (err) {
    console.error('[updatePolicy] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const deletePolicy = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const [row] = await query(`SELECT * FROM coupon_policies WHERE id = ?`, [id]);
    if (!row || row.store_id !== storeId) {
      return res.status(404).json(error('NOT_FOUND', '정책을 찾을 수 없습니다'));
    }
    await query(`DELETE FROM coupon_policies WHERE id = ?`, [id]);
    return res.status(200).json(success(null, '정책이 삭제되었습니다'));
  } catch (err) {
    console.error('[deletePolicy] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};
