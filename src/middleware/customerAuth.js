/**
 * 고객용 JWT 인증 미들웨어
 * access token( role=customer, type=access )만 허용.
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { error } from '../utils/response.js';

dotenv.config();

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET || 'your-secret-key';

export const authenticateCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(error('AUTH_REQUIRED', '토큰이 필요합니다'));
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);

    if (payload.type !== 'access' || payload.role !== 'customer') {
      return res.status(401).json(error('INVALID_TOKEN', '고객 토큰이 아닙니다'));
    }

    req.customerId = payload.customerId;
    req.customer = payload;
    next();
  } catch (err) {
    return res.status(401).json(error('INVALID_TOKEN', '토큰이 유효하지 않습니다', { message: err.message }));
  }
};
