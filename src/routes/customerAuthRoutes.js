import express from 'express';
import { socialLogin, refreshToken, logoutCustomer, getMe } from '../controllers/customerAuthController.js';

const router = express.Router();

router.post('/social-login', socialLogin);
router.post('/refresh', refreshToken);
router.post('/logout', logoutCustomer);
router.get('/me', getMe);

export default router;
