import express from 'express';
import { socialLogin, signupCustomer, refreshToken, logoutCustomer, getMe } from '../controllers/customerAuthController.js';

const router = express.Router();

router.post('/social-login', socialLogin);
router.post('/signup', signupCustomer);
router.post('/refresh', refreshToken);
router.post('/logout', logoutCustomer);
router.get('/me', getMe);

export default router;
