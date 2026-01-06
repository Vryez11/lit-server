/**
 * 예약 라우트
 * Phase 3 - 예약 관리 API 엔드포인트
 */

import express from 'express';
import {
  createReservation,
  getReservations,
  getReservation,
  approveReservation,
  rejectReservation,
  cancelReservation,
  updateReservationStatus,
  storeCheckin,
} from '../controllers/reservationController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// 모든 예약 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * 예약 생성
 * POST /api/reservations
 */
router.post('/', createReservation);

/**
 * 예약 목록 조회
 * GET /api/reservations
 * Query params: status, date, customerId, page, limit
 */
router.get('/', getReservations);

/**
 * 예약 단일 조회
 * GET /api/reservations/:id
 */
router.get('/:id', getReservation);

/**
 * 예약 승인
 * PUT /api/reservations/:id/approve
 */
router.put('/:id/approve', approveReservation);

/**
 * 예약 거부
 * PUT /api/reservations/:id/reject
 */
router.put('/:id/reject', rejectReservation);

/**
 * 예약 취소
 * PUT /api/reservations/:id/cancel
 */
router.put('/:id/cancel', cancelReservation);

/**
 * 예약 상태 변경
 * PUT /api/reservations/:id/status
 */
router.put('/:id/status', updateReservationStatus);

/**
 * 매장 체크인 (사진 업로드 후 in_progress 전환)
 * PUT /api/reservations/:id/checkin
 */
router.put('/:id/checkin', storeCheckin);

export default router;
