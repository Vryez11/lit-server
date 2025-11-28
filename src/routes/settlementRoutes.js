/**
 * 정산 라우트
 */

import express from 'express';
import {
  runSettlement,
  getSettlements,
  getSettlementDetail,
  getSettlementLogs,
  getSettlementErrors,
} from '../controllers/settlementController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 모든 라우트에 인증 필요
router.use(authenticateToken);

/**
 * 정산 수동 실행 (관리자용)
 * POST /api/settlements/run
 * Body: { startDate?: "2025-01-01", endDate?: "2025-01-02", dryRun?: true }
 *
 * 주의: 실제 운영 환경에서는 관리자 권한 체크 미들웨어를 추가해야 합니다.
 * 예: router.post('/run', authenticateToken, isAdmin, runSettlement);
 */
router.post('/run', runSettlement);

/**
 * 점포별 정산 내역 조회
 * GET /api/settlements?page=1&limit=20
 */
router.get('/', getSettlements);

/**
 * 정산 상세 조회
 * GET /api/settlements/:id
 */
router.get('/:id', getSettlementDetail);

/**
 * 정산 로그 조회 (관리자용)
 * GET /api/settlements/logs?page=1&limit=20
 *
 * 주의: 실제 운영 환경에서는 관리자 권한 체크 미들웨어를 추가해야 합니다.
 */
router.get('/logs', getSettlementLogs);

/**
 * 정산 에러 조회 (관리자용)
 * GET /api/settlements/errors?page=1&limit=20
 *
 * 주의: 실제 운영 환경에서는 관리자 권한 체크 미들웨어를 추가해야 합니다.
 */
router.get('/errors', getSettlementErrors);

export default router;
