import express from 'express';
import { createReservation } from '../controllers/reservationController.js';
import { authenticateCustomer } from '../middleware/customerAuth.js';

const router = express.Router();

// 고객 인증 필요
router.use(authenticateCustomer);

// 예약 생성
router.post('/', createReservation);

export default router;
