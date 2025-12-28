/**
 * 고객용 스토어 조회 컨트롤러 (단순 필드만 반환)
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';

/**
 * GET /api/customer/stores
 * 목록 조회: business_name, phone_number, address, latitude, longitude만 반환
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
        AND (s.has_completed_setup = TRUE OR s.has_completed_setup IS NULL)
    `;

    if (keyword) {
      sql += ' AND (s.business_name LIKE ? OR s.address LIKE ?)';
      const like = `%${keyword}%`;
      params.push(like, like);
    }

    sql += ' ORDER BY s.business_name ASC LIMIT ?';
    params.push(normalizedLimit);

    const rows = await query(sql, params);

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
 * 상세 조회: business_name, phone_number, address, latitude, longitude만 반환
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
    return res.json(
      success(
        {
          id: row.id,
          businessName: row.business_name,
          phoneNumber: row.phone_number,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
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
