import express from 'express';
import {
  createPolicy,
  listPolicies,
  getPolicy,
  updatePolicy,
  deletePolicy,
} from '../controllers/couponPolicyController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// 모든 라우트는 매장 인증 필요
router.use(authenticate);

router.post('/', createPolicy);
router.get('/', listPolicies);
router.get('/:id', getPolicy);
router.put('/:id', updatePolicy);
router.delete('/:id', deletePolicy);

export default router;
