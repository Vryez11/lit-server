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
    const { limit = 20, latitude, longitude, radius, keyword } = req.query;

    const normalizedLimit = Math.min(parseInt(limit, 10) || 20, 50);
    const hasLocation =
      latitude !== undefined &&
      longitude !== undefined &&
      !Number.isNaN(parseFloat(latitude)) &&
      !Number.isNaN(parseFloat(longitude));

    const params = [];
    let distanceSelect = '';
    if (hasLocation) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      // Haversine formula (km)
      distanceSelect = `,
        (6371 * acos(
          cos(radians(?)) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians(?)) +
          sin(radians(?)) * sin(radians(s.latitude))
        )) AS distance_km`;
      params.push(lat, lon, lat);
    }

    let sql = `
      SELECT
        s.id,
        s.business_name,
        s.phone_number,
        s.address,
        s.latitude,
        s.longitude
        ${distanceSelect}
      FROM stores s
      WHERE 1=1
        AND (s.has_completed_setup = TRUE OR s.has_completed_setup IS NULL)
    `;

    // 검색어 필터
    if (keyword) {
      sql += ' AND (s.business_name LIKE ? OR s.address LIKE ?)';
      const like = `%${keyword}%`;
      params.push(like, like);
    }

    // 반경 필터 (위치가 있을 때만)
    if (hasLocation && radius && !Number.isNaN(parseFloat(radius))) {
      sql += ' HAVING distance_km <= ?';
      params.push(parseFloat(radius));
    }

    // 정렬: 위치 있으면 거리, 없으면 이름
    if (hasLocation) {
      sql += ' ORDER BY distance_km ASC';
    } else {
      sql += ' ORDER BY s.business_name ASC';
    }

    sql += ' LIMIT ?';
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
            distanceKm: row.distance_km,
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
