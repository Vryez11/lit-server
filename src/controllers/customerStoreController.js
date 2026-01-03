/**
 * 고객용 스토어 조회 컨트롤러 (단순 필드만 반환)
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';

// snake_case 키를 camelCase로 변환하는 유틸
const toCamel = (str) => str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelize = (value) => {
  if (Array.isArray(value)) {
    return value.map(camelize);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [k, v]) => {
      acc[toCamel(k)] = camelize(v);
      return acc;
    }, {});
  }
  return value;
};

/**
 * GET /api/customer/stores
 * 목록 조회: stores 기본 정보 + reviews + operating_hours + store_settings
 */
export const listStores = async (req, res) => {
  try {
    const { limit = 20, keyword } = req.query;
    const normalizedLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const params = [];
    let sql = `
      SELECT
        s.id,
        s.business_name,
        s.phone_number,
        s.address,
        s.latitude,
        s.longitude
      FROM stores s
      WHERE 1=1
    `;

    if (keyword) {
      sql += ' AND (s.business_name LIKE ? OR s.address LIKE ?)';
      const like = `%${keyword}%`;
      params.push(like, like);
    }

    sql += ' ORDER BY s.business_name ASC LIMIT ?';
    params.push(normalizedLimit);

    const rows = await query(sql, params);

    if (!rows || rows.length === 0) {
      return res.json(success({ items: [] }, '스토어 목록 조회 성공'));
    }

    const storeIds = rows.map((r) => r.id);
    const placeholders = storeIds.map(() => '?').join(',');

    // 연관 데이터 조회
    const reviews = await query(
      `SELECT * FROM reviews WHERE store_id IN (${placeholders})`,
      storeIds
    );
    const hours = await query(
      `SELECT * FROM store_operating_hours WHERE store_id IN (${placeholders})`,
      storeIds
    );
    const settings = await query(
      `SELECT * FROM store_settings WHERE store_id IN (${placeholders})`,
      storeIds
    );

    // 매핑
    const reviewsMap = {};
    reviews.forEach((rev) => {
      if (!reviewsMap[rev.store_id]) reviewsMap[rev.store_id] = [];
      reviewsMap[rev.store_id].push(rev);
    });

    const hoursMap = {};
    hours.forEach((h) => {
      hoursMap[h.store_id] = h;
    });

    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.store_id] = s;
    });

    return res.json(
      success(
        {
          items: rows.map((row) => ({
            id: row.id,
            businessName: row.business_name,
            phoneNumber: row.phone_number,
            address: row.address,
            latitude: row.latitude,
            longitude: row.longitude,
            reviews: camelize(reviewsMap[row.id] || []),
            operatingHours: camelize(hoursMap[row.id] || null),
            settings: camelize(settingsMap[row.id] || null),
          })),
        },
        '스토어 목록 조회 성공'
      )
    );
  } catch (err) {
    console.error('고객용 스토어 목록 조회 오류:', err);
    return res
      .status(500)
      .json(error('INTERNAL_ERROR', '스토어 목록을 불러오는 중 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * GET /api/customer/stores/:storeId
 * 상세 조회: stores 기본 정보 + reviews + operating_hours + store_settings
 */
export const getStoreDetail = async (req, res) => {
  try {
    const { storeId } = req.params;

    const rows = await query(
      `
      SELECT
        s.id,
        s.business_name,
        s.phone_number,
        s.address,
        s.latitude,
        s.longitude
      FROM stores s
      WHERE s.id = ?
      LIMIT 1
      `,
      [storeId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json(error('NOT_FOUND', '스토어를 찾을 수 없습니다'));
    }

    const row = rows[0];

    // 연관 데이터 조회
    const [reviews, hours, settings] = await Promise.all([
      query(`SELECT * FROM reviews WHERE store_id = ?`, [storeId]),
      query(`SELECT * FROM store_operating_hours WHERE store_id = ? LIMIT 1`, [storeId]),
      query(`SELECT * FROM store_settings WHERE store_id = ? LIMIT 1`, [storeId]),
    ]);

    return res.json(
      success(
        {
          id: row.id,
          businessName: row.business_name,
          phoneNumber: row.phone_number,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
          reviews: camelize(reviews || []),
          operatingHours: camelize(hours && hours.length > 0 ? hours[0] : null),
          settings: camelize(settings && settings.length > 0 ? settings[0] : null),
        },
        '스토어 상세 조회 성공'
      )
    );
  } catch (err) {
    console.error('고객용 스토어 상세 조회 오류:', err);
    return res
      .status(500)
      .json(error('INTERNAL_ERROR', '스토어 상세를 불러오는 중 오류가 발생했습니다', { message: err.message }));
  }
};
