import express from 'express';
import {
  createReservation,
  getCustomerReservations,
  getCustomerReservation,
  customerCheckin,
  customerCheckout,
} from '../controllers/reservationController.js';
import { authenticateCustomer } from '../middleware/customerAuth.js';

const router = express.Router();

// 고객 인증 필요
router.use(authenticateCustomer);

// 예약 체크인/체크아웃
router.put('/:id/checkin', customerCheckin);
router.put('/:id/checkout', customerCheckout);

// 예약 조회 (목록, 단건)
router.get('/', getCustomerReservations);
router.get('/:id', getCustomerReservation);

// 예약 생성
router.post('/', createReservation);

export default router;
