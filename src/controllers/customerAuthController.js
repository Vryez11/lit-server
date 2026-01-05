/**
 * Customer social login / signup controller (e.g., Kakao)
 * NOTE: External provider token validation is not implemented yet.
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

/**
 * 소셜 로그인: 신규면 생성, 기존이면 갱신 후 토큰 발급
 */
export const socialLogin = async (req, res) => {
  try {
    const {
      provider,
      accessToken,
      socialAccessToken,
      refreshToken: providerRefreshToken,
      socialId,
      name,
      email,
      profileImage,
      phoneNumber,
      birthDate,
      carrier,
      gender,
      termsAgreed,
      privacyAgreed,
      locationAgreed,
      marketingAgreed,
    } = req.body;

    const accessTokenInput = accessToken || socialAccessToken;

    if (!provider || !socialId || !accessTokenInput) {
      return res
        .status(400)
        .json(
          error('VALIDATION_ERROR', 'provider, socialId, accessToken이 필요합니다', {
            required: ['provider', 'socialId', 'accessToken'],
          })
        );
    }

    const providerKey = provider.toLowerCase();
    const providerId = socialId; // 고정 식별자 사용 (access token 해시 미사용)

    const toBit = (val, fallback = 0) => {
      if (val === undefined || val === null) return fallback;
      return val ? 1 : 0;
    };

    const existing = await query(
      'SELECT * FROM customers WHERE provider_type = ? AND provider_id = ? LIMIT 1',
      [providerKey, providerId]
    );

    let customerId;
    let isNewUser = false;

    if (existing && existing.length > 0) {
      customerId = existing[0].id;
      await query(
        `UPDATE customers
           SET last_login_at = NOW(),
               name = COALESCE(?, name),
               email = COALESCE(?, email),
               phone_number = COALESCE(?, phone_number),
               birth_date = COALESCE(?, birth_date),
               carrier = COALESCE(?, carrier),
               gender = COALESCE(?, gender),
               profile_image_url = COALESCE(?, profile_image_url),
               terms_agreed = COALESCE(?, terms_agreed),
               privacy_agreed = COALESCE(?, privacy_agreed),
               location_agreed = COALESCE(?, location_agreed),
               marketing_agreed = COALESCE(?, marketing_agreed)
         WHERE id = ?`,
        [
          name || null,
          email || null,
          phoneNumber || null,
          birthDate || null,
          carrier || null,
          gender || null,
          profileImage || null,
          toBit(termsAgreed, 0),
          toBit(privacyAgreed, 0),
          toBit(locationAgreed, 0),
          toBit(marketingAgreed, 0),
          customerId,
        ]
      );
    } else {
      isNewUser = true;
      customerId = `cust_${uuidv4()}`;
      await query(
        `INSERT INTO customers (id, provider_type, provider_id, name, email, phone_number, birth_date, carrier, gender, profile_image_url, terms_agreed, privacy_agreed, location_agreed, marketing_agreed, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [
          customerId,
          providerKey,
          providerId,
          name || '사용자',
          email || null,
          phoneNumber || null,
          birthDate || null,
          carrier || null,
          gender || null,
          profileImage || null,
          toBit(termsAgreed, 0),
          toBit(privacyAgreed, 0),
          toBit(locationAgreed, 0),
          toBit(marketingAgreed, 0),
        ]
      );
    }

    // provider 링크 upsert
    const providerLink = await query(
      'SELECT id FROM customer_auth_providers WHERE provider_type = ? AND provider_id = ? LIMIT 1',
      [providerKey, providerId]
    );
    if (providerLink && providerLink.length > 0) {
      await query(
        `UPDATE customer_auth_providers
           SET email = COALESCE(?, email),
               raw_profile = COALESCE(?, raw_profile),
               updated_at = NOW()
         WHERE id = ?`,
        [email || null, null, providerLink[0].id]
      );
    } else {
      await query(
        `INSERT INTO customer_auth_providers (customer_id, provider_type, provider_id, email, raw_profile, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [customerId, providerKey, providerId, email || null, null]
      );
    }

    // 토큰 발급 및 refresh 저장
    const access = generateCustomerAccessToken(customerId, providerKey);
    const refresh = generateCustomerRefreshToken(customerId, providerKey);
    await query(
      `INSERT INTO customer_refresh_tokens (customer_id, token, expires_at, created_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
      [customerId, refresh]
    );

    return res.json(
      success({
        isNewUser,
        accessToken: access,
        refreshToken: refresh,
        providerRefreshToken: providerRefreshToken || null,
        userId: customerId,
        customerId,
        name: name || existing?.[0]?.name || '사용자',
        email: email || existing?.[0]?.email || null,
        phoneNumber: phoneNumber || existing?.[0]?.phone_number || null,
        profileImage: profileImage || existing?.[0]?.profile_image_url || null,
        birthDate: birthDate || existing?.[0]?.birth_date || null,
        carrier: carrier || existing?.[0]?.carrier || null,
        gender: gender || existing?.[0]?.gender || null,
        termsAgreed: toBit(termsAgreed, existing?.[0]?.terms_agreed ?? 0),
        privacyAgreed: toBit(privacyAgreed, existing?.[0]?.privacy_agreed ?? 0),
        locationAgreed: toBit(locationAgreed, existing?.[0]?.location_agreed ?? 0),
        marketingAgreed: toBit(marketingAgreed, existing?.[0]?.marketing_agreed ?? 0),
        provider: providerKey,
      })
    );
  } catch (err) {
    console.error('[socialLogin] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 신규 회원 가입(온보딩) 완료 처리
 * isNewUser=true 분기에서 호출하는 API
 */
export const signupCustomer = async (req, res) => {
  try {
    const {
      provider,
      socialId,
      accessToken,
      socialAccessToken,
      userId,
      customerId: customerIdFromBody,
      name,
      email,
      phoneNumber,
      profileImage,
      birthDate,
      carrier,
      gender,
      termsAgreed,
      privacyAgreed,
      locationAgreed,
      marketingAgreed,
    } = req.body;

    const accessTokenInput = accessToken || socialAccessToken;

    if (!provider || (!socialId && !userId && !customerIdFromBody)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', 'provider와 socialId 또는 userId가 필요합니다', {
          required: ['provider', 'socialId|userId'],
        })
      );
    }

    const providerKey = provider.toLowerCase();
    const providerId = socialId || null; // 고정 식별자만 사용
    const toBit = (val, fallback = 0) => {
      if (val === undefined || val === null) return fallback;
      return val ? 1 : 0;
    };
    let customerId = userId || customerIdFromBody || null;
    let isNewUser = false;

    // 식별 우선순위: userId -> provider + providerId
    if (customerId) {
      const exists = await query('SELECT id FROM customers WHERE id = ? LIMIT 1', [customerId]);
      if (!exists || exists.length === 0) {
        isNewUser = true;
        customerId = `cust_${uuidv4()}`;
        await query(
          `INSERT INTO customers (id, provider_type, provider_id, name, email, phone_number, birth_date, carrier, gender, profile_image_url, terms_agreed, privacy_agreed, location_agreed, marketing_agreed, last_login_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            customerId,
            providerKey,
            providerId,
            name || '사용자',
            email || null,
            phoneNumber || null,
            birthDate || null,
            carrier || null,
            gender || null,
            profileImage || null,
            toBit(termsAgreed, 0),
            toBit(privacyAgreed, 0),
            toBit(locationAgreed, 0),
            toBit(marketingAgreed, 0),
          ]
        );
      }
    } else if (providerId) {
      const existing = await query(
        'SELECT * FROM customers WHERE provider_type = ? AND provider_id = ? LIMIT 1',
        [providerKey, providerId]
      );
      if (existing && existing.length > 0) {
        customerId = existing[0].id;
      } else {
        isNewUser = true;
        customerId = `cust_${uuidv4()}`;
        await query(
        `INSERT INTO customers (id, provider_type, provider_id, name, email, phone_number, birth_date, carrier, gender, profile_image_url, terms_agreed, privacy_agreed, location_agreed, marketing_agreed, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [
          customerId,
          providerKey,
          providerId,
          name || '사용자',
          email || null,
          phoneNumber || null,
          birthDate || null,
          carrier || null,
          gender || null,
          profileImage || null,
          toBit(termsAgreed, 0),
          toBit(privacyAgreed, 0),
          toBit(locationAgreed, 0),
          toBit(marketingAgreed, 0),
        ]
      );
      }
    }

    if (!customerId) {
      return res.status(400).json(error('VALIDATION_ERROR', 'customerId를 결정할 수 없습니다'));
    }

    // 프로필 업데이트
    await query(
      `UPDATE customers
         SET name = COALESCE(?, name),
             email = COALESCE(?, email),
             phone_number = COALESCE(?, phone_number),
             birth_date = COALESCE(?, birth_date),
             carrier = COALESCE(?, carrier),
             gender = COALESCE(?, gender),
             profile_image_url = COALESCE(?, profile_image_url),
             terms_agreed = COALESCE(?, terms_agreed),
             privacy_agreed = COALESCE(?, privacy_agreed),
             location_agreed = COALESCE(?, location_agreed),
             marketing_agreed = COALESCE(?, marketing_agreed),
             last_login_at = NOW()
       WHERE id = ?`,
      [
        name || null,
        email || null,
        phoneNumber || null,
        birthDate || null,
        carrier || null,
        gender || null,
        profileImage || null,
        toBit(termsAgreed),
        toBit(privacyAgreed, 0),
        toBit(locationAgreed, 0),
        toBit(marketingAgreed, 0),
        customerId,
      ]
    );

    // provider 링크 upsert
    if (providerId) {
      const providerLink = await query(
        'SELECT id FROM customer_auth_providers WHERE provider_type = ? AND provider_id = ? LIMIT 1',
        [providerKey, providerId]
      );
      if (providerLink && providerLink.length > 0) {
        await query(
          `UPDATE customer_auth_providers
             SET email = COALESCE(?, email),
                 updated_at = NOW()
           WHERE id = ?`,
          [email || null, providerLink[0].id]
        );
      } else {
        await query(
          `INSERT INTO customer_auth_providers (customer_id, provider_type, provider_id, email, raw_profile, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [customerId, providerKey, providerId, email || null, null]
        );
      }
    }

    // 토큰 재발급 및 refresh 저장
    const access = generateCustomerAccessToken(customerId, providerKey);
    const refresh = generateCustomerRefreshToken(customerId, providerKey);
    await query(
      `INSERT INTO customer_refresh_tokens (customer_id, token, expires_at, created_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
      [customerId, refresh]
    );

    return res.json(
      success({
        isNewUser,
        accessToken: access,
        refreshToken: refresh,
        userId: customerId,
        customerId,
        name: name || null,
        email: email || null,
        phoneNumber: phoneNumber || null,
        profileImage: profileImage || null,
        birthDate: birthDate || null,
        carrier: carrier || null,
        gender: gender || null,
        termsAgreed: toBit(termsAgreed, 0),
        privacyAgreed: toBit(privacyAgreed, 0),
        locationAgreed: toBit(locationAgreed, 0),
        marketingAgreed: toBit(marketingAgreed, 0),
        provider: providerKey,
      })
    );
  } catch (err) {
    console.error('[signupCustomer] error:', err);
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
      `UPDATE customer_refresh_tokens SET token = ?, expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?`,
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
    const rows = await query(
      'SELECT id, email, name, phone_number, provider_type, profile_image_url FROM customers WHERE id = ? LIMIT 1',
      [customerId]
    );
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
        profileImage: user.profile_image_url,
      })
    );
  } catch (err) {
    console.error('[getMe] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};
