import express from 'express';
import {
  claimCoupon,
  listCoupons,
  getCoupon,
  getCouponStats,
  useCoupon,
} from '../controllers/couponController.js';
import { authenticateCustomer } from '../middleware/customerAuth.js';

const router = express.Router();

// 고객 쿠폰 발급 (로그인 필요)
router.post('/claim', authenticateCustomer, claimCoupon);

// 쿠폰 목록/통계/상세 (로그인 필요)
router.get('/', authenticateCustomer, listCoupons);
router.get('/stats', authenticateCustomer, getCouponStats);
router.get('/:id', authenticateCustomer, getCoupon);

// 서비스형 쿠폰 사용 (고객이 직접 사용 처리)
router.post('/:id/use', authenticateCustomer, useCoupon);

export default router;
