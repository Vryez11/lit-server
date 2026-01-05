/**
 * 고객용 소셜 로그인 컨트롤러 (카카오 등)
 * NOTE: 외부 토큰 검증은 추후 추가 필요. 현재는 토큰 해시 기반으로 사용자 생성/조회.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { query } from '../config/database.js';
import { success, error } from '../utils/response.js';

dotenv.config();

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET || 'your-secret-key';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET || 'your-refresh-secret-key';
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '30d';

const generateCustomerAccessToken = (customerId, provider) =>
  jwt.sign({ customerId, role: 'customer', provider, type: 'access' }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

const generateCustomerRefreshToken = (customerId, provider) =>
  jwt.sign({ customerId, role: 'customer', provider, type: 'refresh' }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

const verifyAccess = (token) => {
  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (payload.type !== 'access') throw new Error('Invalid token type');
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const verifyRefresh = (token) => {
  try {
    const payload = jwt.verify(token, REFRESH_TOKEN_SECRET);
    if (payload.type !== 'refresh') throw new Error('Invalid token type');
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

export const socialLogin = async (req, res) => {
  try {
    const { provider, accessToken } = req.body;

    if (!provider || !accessToken) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', 'provider와 accessToken이 필요합니다', { required: ['provider', 'accessToken'] }));
    }

    // 외부 검증은 생략하고 토큰 해시를 provider_id로 사용
    const providerId = crypto.createHash('sha256').update(accessToken).digest('hex');

    // 고객 조회/생성
    const existing = await query(
      'SELECT * FROM customers WHERE provider_type = ? AND provider_id = ? LIMIT 1',
      [provider.toLowerCase(), providerId]
    );

    let customerId;
    if (existing && existing.length > 0) {
      customerId = existing[0].id;
      await query('UPDATE customers SET last_login_at = NOW() WHERE id = ?', [customerId]);
    } else {
      customerId = `cust_${uuidv4()}`;
      await query(
        `INSERT INTO customers (id, provider_type, provider_id, name, email, phone_number, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [customerId, provider.toLowerCase(), providerId, '사용자', null, null]
      );
    }

    // 토큰 생성/저장
    const access = generateCustomerAccessToken(customerId, provider);
    const refresh = generateCustomerRefreshToken(customerId, provider);
    await query(
      `INSERT INTO customer_refresh_tokens (customer_id, token, expires_at, created_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
      [customerId, refresh]
    );

    return res.json(
      success({
        accessToken: access,
        refreshToken: refresh,
        user: {
          id: customerId,
          name: existing?.[0]?.name || '사용자',
          email: existing?.[0]?.email || null,
          phoneNumber: existing?.[0]?.phone_number || null,
          provider,
        },
      })
    );
  } catch (err) {
    console.error('[socialLogin] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json(error('VALIDATION_ERROR', 'refreshToken이 필요합니다'));
    }

    const verified = verifyRefresh(token);
    if (!verified.valid) {
      return res.status(401).json(error('INVALID_REFRESH_TOKEN', 'refreshToken이 유효하지 않습니다'));
    }

    const { customerId, provider } = verified.payload;
    const records = await query('SELECT id FROM customer_refresh_tokens WHERE token = ? LIMIT 1', [token]);
    if (!records || records.length === 0) {
      return res.status(401).json(error('INVALID_REFRESH_TOKEN', 'refreshToken이 유효하지 않습니다'));
    }

    const access = generateCustomerAccessToken(customerId, provider);
    const newRefresh = generateCustomerRefreshToken(customerId, provider);

    await query(
      `UPDATE customer_refresh_tokens SET token = ?, expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), updated_at = NOW() WHERE id = ?`,
      [newRefresh, records[0].id]
    );

    return res.json(success({ accessToken: access, refreshToken: newRefresh }));
  } catch (err) {
    console.error('[refreshToken] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const logoutCustomer = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (token) {
      await query('DELETE FROM customer_refresh_tokens WHERE token = ?', [token]);
    }
    return res.json(success({ message: '로그아웃 완료' }));
  } catch (err) {
    console.error('[logoutCustomer] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const getMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json(error('AUTH_REQUIRED', '토큰이 필요합니다'));
    }

    const verified = verifyAccess(token);
    if (!verified.valid) {
      return res.status(401).json(error('INVALID_TOKEN', '토큰이 유효하지 않습니다'));
    }

    const { customerId } = verified.payload;
    const rows = await query('SELECT id, email, name, phone_number, provider_type FROM customers WHERE id = ? LIMIT 1', [
      customerId,
    ]);
    if (!rows || rows.length === 0) {
      return res.status(404).json(error('USER_NOT_FOUND', '사용자를 찾을 수 없습니다'));
    }

    const user = rows[0];
    return res.json(
      success({
        id: user.id,
        email: user.email,
        name: user.name,
        phoneNumber: user.phone_number,
        provider: user.provider_type,
      })
    );
  } catch (err) {
    console.error('[getMe] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};
