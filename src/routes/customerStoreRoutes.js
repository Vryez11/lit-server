/**
 * 고객용 스토어 조회 라우트
 */

import express from 'express';
import { getStoreDetail, listStores } from '../controllers/customerStoreController.js';

const router = express.Router();

// 목록 조회
router.get('/', listStores);

// 상세 조회
router.get('/:storeId', getStoreDetail);

export default router;
