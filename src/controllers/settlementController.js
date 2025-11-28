/**
 * 정산 컨트롤러
 */

import { pool } from '../config/database.js';
import { runSettlementPeriod } from '../services/settlementService.js';
import { getYesterdayPeriod } from '../utils/settlementPeriod.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * 정산 수동 실행 (관리자용)
 * POST /api/settlements/run
 * Body: { startDate?: "2025-01-01", endDate?: "2025-01-02", dryRun?: true }
 */
export const runSettlement = async (req, res) => {
  try {
    const { startDate, endDate, dryRun = false } = req.body;

    let periodStart, periodEnd;

    // 날짜가 지정되지 않으면 어제 기간 사용
    if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);

      if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
        return sendError(res, 'INVALID_DATE', '유효하지 않은 날짜 형식입니다.', 400);
      }

      if (periodEnd <= periodStart) {
        return sendError(res, 'INVALID_PERIOD', 'endDate는 startDate보다 이후여야 합니다.', 400);
      }
    } else {
      const period = getYesterdayPeriod();
      periodStart = period.periodStart;
      periodEnd = period.periodEnd;
    }

    const result = await runSettlementPeriod({
      periodStart,
      periodEnd,
      dryRun,
    });

    return sendSuccess(res, result);
  } catch (error) {
    console.error('정산 실행 중 오류:', error);
    return sendError(res, 'SETTLEMENT_RUN_FAILED', error.message, 500);
  }
};

/**
 * 점포별 정산 내역 조회
 * GET /api/settlements?page=1&limit=20
 */
export const getSettlements = async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    // 정산 내역 조회
    const [statements] = await pool.query(
      `SELECT
         id,
         period_start,
         period_end,
         total_sales,
         commission_rate,
         commission_amount,
         payout_amount,
         status,
         meta,
         created_at,
         updated_at
       FROM settlement_statements
       WHERE store_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [storeId, limit, offset]
    );

    // 총 개수 조회
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total
       FROM settlement_statements
       WHERE store_id = ?`,
      [storeId]
    );

    const total = countResult[0].total;

    return sendSuccess(res, {
      statements: statements.map((s) => ({
        ...s,
        meta: s.meta ? JSON.parse(s.meta) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('정산 내역 조회 중 오류:', error);
    return sendError(res, 'SETTLEMENTS_FETCH_FAILED', error.message, 500);
  }
};

/**
 * 정산 상세 조회
 * GET /api/settlements/:id
 */
export const getSettlementDetail = async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const { id } = req.params;

    // 정산서 조회
    const [statements] = await pool.query(
      `SELECT
         id,
         period_start,
         period_end,
         total_sales,
         commission_rate,
         commission_amount,
         payout_amount,
         status,
         meta,
         created_at,
         updated_at
       FROM settlement_statements
       WHERE id = ? AND store_id = ?`,
      [id, storeId]
    );

    if (statements.length === 0) {
      return sendError(res, 'SETTLEMENT_NOT_FOUND', '정산 내역을 찾을 수 없습니다.', 404);
    }

    const statement = statements[0];

    // 정산 항목 조회 (결제 내역)
    const [items] = await pool.query(
      `SELECT
         si.id,
         si.payment_id,
         si.amount,
         si.created_at,
         p.pg_order_id,
         p.pg_method,
         p.paid_at
       FROM settlement_items si
       LEFT JOIN payments p ON si.payment_id = p.id
       WHERE si.statement_id = ?
       ORDER BY si.created_at DESC`,
      [id]
    );

    return sendSuccess(res, {
      statement: {
        ...statement,
        meta: statement.meta ? JSON.parse(statement.meta) : null,
      },
      items,
    });
  } catch (error) {
    console.error('정산 상세 조회 중 오류:', error);
    return sendError(res, 'SETTLEMENT_DETAIL_FETCH_FAILED', error.message, 500);
  }
};

/**
 * 정산 로그 조회 (관리자용)
 * GET /api/settlements/logs?page=1&limit=20
 */
export const getSettlementLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    // 정산 로그 조회
    const [logs] = await pool.query(
      `SELECT
         id,
         started_at,
         ended_at,
         period_start,
         period_end,
         status,
         message,
         error_message,
         total_payments,
         total_statements,
         success_payments,
         skipped_payments,
         total_payout,
         total_commission,
         created_at
       FROM settlement_logs
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // 총 개수 조회
    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM settlement_logs`);
    const total = countResult[0].total;

    return sendSuccess(res, {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('정산 로그 조회 중 오류:', error);
    return sendError(res, 'SETTLEMENT_LOGS_FETCH_FAILED', error.message, 500);
  }
};

/**
 * 정산 에러 조회 (관리자용)
 * GET /api/settlements/errors?page=1&limit=20
 */
export const getSettlementErrors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    // 정산 에러 조회
    const [errors] = await pool.query(
      `SELECT
         id,
         type,
         payment_id,
         store_id,
         statement_id,
         message,
         raw_data,
         created_at
       FROM settlement_errors
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // 총 개수 조회
    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM settlement_errors`);
    const total = countResult[0].total;

    return sendSuccess(res, {
      errors: errors.map((e) => ({
        ...e,
        raw_data: e.raw_data ? JSON.parse(e.raw_data) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('정산 에러 조회 중 오류:', error);
    return sendError(res, 'SETTLEMENT_ERRORS_FETCH_FAILED', error.message, 500);
  }
};
