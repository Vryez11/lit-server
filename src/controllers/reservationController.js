
/**
 * Reservation controller
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { issueCouponsForTrigger } from '../services/couponAutoIssue.js';

const toMySQLDateTime = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const ALLOWED_STATUSES = ['pending', 'pending_approval', 'confirmed', 'rejected', 'in_progress', 'completed', 'cancelled'];
const ALLOWED_STORAGE_TYPES = ['s', 'm', 'l', 'xl', 'special', 'refrigeration'];

export const createReservation = async (req, res) => {
  try {
    const storeId = req.storeId || req.body.storeId;
    const {
      customerName,
      phoneNumber,
      email,
      startTime,
      endTime,
      duration,
      price,
      bagCount,
      message,
      specialRequests,
      luggageImageUrls,
      paymentMethod = 'card',
      requestTime,
      storageType,
    } = req.body;

    if (!customerName || !phoneNumber || !startTime || !duration || !bagCount || !storeId || !storageType) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '필수 정보가 누락되었습니다', {
          required: ['storeId', 'customerName', 'phoneNumber', 'startTime', 'duration', 'bagCount', 'storageType'],
        })
      );
    }

    if (!ALLOWED_STORAGE_TYPES.includes(storageType)) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '허용되지 않는 보관함 타입입니다', { allowed: ALLOWED_STORAGE_TYPES }));
    }

    const reservationId = `res_${uuidv4()}`;
    let calculatedEndTime = endTime;
    if (!calculatedEndTime && startTime && duration) {
      const start = new Date(startTime);
      start.setHours(start.getHours() + Number(duration));
      calculatedEndTime = start.toISOString();
    }

    const customerId = req.customerId || req.body.customerId || `cust_${Date.now()}`;

    await query(
      `INSERT INTO reservations (
         id, store_id, customer_id, customer_name, customer_phone, customer_email,
         storage_id, storage_number, requested_storage_type,
         status, start_time, end_time, request_time, actual_start_time, actual_end_time,
         duration, bag_count, total_amount, message, special_requests, luggage_image_urls,
         payment_status, payment_method, qr_code, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        reservationId,
        storeId,
        customerId,
        customerName,
        phoneNumber,
        email || null,
        null, // storage_id
        null, // storage_number
        storageType,
        'pending',
        toMySQLDateTime(startTime),
        toMySQLDateTime(calculatedEndTime),
        toMySQLDateTime(requestTime || new Date().toISOString()),
        null, // actual_start_time
        null, // actual_end_time
        duration,
        bagCount,
        price || 0,
        message || null,
        specialRequests || null,
        luggageImageUrls ? JSON.stringify(luggageImageUrls) : null,
        'pending',
        paymentMethod,
        null, // qr_code
      ]
    );

    const [newReservation] = await query(
      `SELECT
         id, store_id as storeId, customer_id as customerId,
         customer_name as customerName, customer_phone as phoneNumber,
         customer_email as email, status, start_time as startTime,
         end_time as endTime, request_time as requestTime, duration,
         bag_count as bagCount, total_amount as price, message, storage_id as storageId, storage_number as storageNumber,
         requested_storage_type as storageType,
         special_requests as specialRequests, payment_status as paymentStatus,
         payment_method as paymentMethod, created_at as createdAt
       FROM reservations WHERE id = ?`,
      [reservationId]
    );

    return res.status(201).json(success(newReservation, '예약이 생성되었습니다'));
  } catch (err) {
    console.error('[createReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const getReservations = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { status, date, customerId, page = 1, limit = 20 } = req.query;

    const conditions = ['store_id = ?'];
    const params = [storeId];
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (date) {
      conditions.push('DATE(start_time) = ?');
      params.push(date);
    }
    if (customerId) {
      conditions.push('customer_id = ?');
      params.push(customerId);
    }
    const whereClause = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*) as total FROM reservations WHERE ${whereClause}`, params);
    const totalItems = countResult[0]?.total || 0;
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await query(
      `SELECT
         id, store_id as storeId, customer_id as customerId,
         customer_name as customerName, customer_phone as phoneNumber,
         customer_email as email, status, start_time as startTime,
         end_time as endTime, request_time as requestTime, duration,
         bag_count as bagCount, total_amount as price, message, storage_id as storageId, storage_number as storageNumber,
         requested_storage_type as storageType,
         special_requests as specialRequests, payment_status as paymentStatus,
         payment_method as paymentMethod, created_at as createdAt
       FROM reservations
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    return res.json(
      success({
        items: rows,
        page: Number(page),
        limit: Number(limit),
        total: totalItems,
      })
    );
  } catch (err) {
    console.error('[getReservations] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const getReservation = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const rows = await query(
      `SELECT
         id, store_id as storeId, customer_id as customerId,
         customer_name as customerName, customer_phone as phoneNumber,
         customer_email as email, status, start_time as startTime,
         end_time as endTime, request_time as requestTime, duration,
         bag_count as bagCount, total_amount as price, message, storage_id as storageId, storage_number as storageNumber,
         requested_storage_type as storageType,
         special_requests as specialRequests, payment_status as paymentStatus,
         payment_method as paymentMethod, created_at as createdAt
       FROM reservations
       WHERE id = ? AND store_id = ? LIMIT 1`,
      [id, storeId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다'));
    }
    return res.json(success(rows[0]));
  } catch (err) {
    console.error('[getReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

// 고객용: 로그인 고객의 예약 목록 조회
export const getCustomerReservations = async (req, res) => {
  try {
    const customerId = req.customerId;
    const { status, date, storeId, page = 1, limit = 20 } = req.query;

    const conditions = ['customer_id = ?'];
    const params = [customerId];
    if (storeId) {
      conditions.push('store_id = ?');
      params.push(storeId);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (date) {
      conditions.push('DATE(start_time) = ?');
      params.push(date);
    }
    const whereClause = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*) as total FROM reservations WHERE ${whereClause}`, params);
    const totalItems = countResult[0]?.total || 0;
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await query(
      `SELECT
         id, store_id as storeId, customer_id as customerId,
         customer_name as customerName, customer_phone as phoneNumber,
         customer_email as email, status, start_time as startTime,
         end_time as endTime, request_time as requestTime, duration,
         bag_count as bagCount, total_amount as price, message,
         storage_id as storageId, storage_number as storageNumber,
         requested_storage_type as storageType,
         special_requests as specialRequests, payment_status as paymentStatus,
         payment_method as paymentMethod, created_at as createdAt
       FROM reservations
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    return res.json(
      success({
        items: rows,
        page: Number(page),
        limit: Number(limit),
        total: totalItems,
      })
    );
  } catch (err) {
    console.error('[getCustomerReservations] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

// 고객용: 로그인 고객의 예약 단건 조회
export const getCustomerReservation = async (req, res) => {
  try {
    const customerId = req.customerId;
    const { id } = req.params;
    const rows = await query(
      `SELECT
         id, store_id as storeId, customer_id as customerId,
         customer_name as customerName, customer_phone as phoneNumber,
         customer_email as email, status, start_time as startTime,
         end_time as endTime, request_time as requestTime, duration,
         bag_count as bagCount, total_amount as price, message,
         storage_id as storageId, storage_number as storageNumber,
         requested_storage_type as storageType,
         special_requests as specialRequests, payment_status as paymentStatus,
         payment_method as paymentMethod, created_at as createdAt
       FROM reservations
       WHERE id = ? AND customer_id = ? LIMIT 1`,
      [id, customerId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다'));
    }
    return res.json(success(rows[0]));
  } catch (err) {
    console.error('[getCustomerReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

// 고객 체크아웃: 상태를 completed로 전환, 실제 종료 시간 기록, 보관함 반납
export const customerCheckout = async (req, res) => {
  try {
    const customerId = req.customerId;
    const { id } = req.params;
    const reservation = await findCustomerReservation(id, customerId);
    if (!reservation) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다'));
    }
    if (reservation.status !== 'in_progress' && reservation.status !== 'confirmed') {
      return res
        .status(400)
        .json(error('INVALID_STATUS', '체크아웃 가능한 상태가 아닙니다', { currentStatus: reservation.status }));
    }

    await query(
      `UPDATE reservations
       SET status = 'completed', actual_end_time = NOW(), updated_at = NOW()
       WHERE id = ? AND customer_id = ?`,
      [id, customerId]
    );

    if (reservation.storage_id) {
      await query('UPDATE storages SET status = ? WHERE id = ?', ['available', reservation.storage_id]);
    }

    // 자동 발급 훅: 예약 완료
    try {
      await issueCouponsForTrigger({
        customerId,
        storeId: reservation.store_id,
        trigger: 'reservation_completed',
        reservationId: reservation.id,
      });
    } catch (hookErr) {
      console.warn('[customerCheckout] auto issue skipped:', hookErr?.message);
    }

    return res.json(success({ id, status: 'completed' }, '체크아웃 완료'));
  } catch (err) {
    console.error('[customerCheckout] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

// 매장 체크인: 점주가 사진 업로드 후 in_progress로 전환
export const storeCheckin = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const { photoUrls = [] } = req.body;

    const reservation = await findStoreReservation(id, storeId);
    if (!reservation) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다'));
    }
    if (reservation.status !== 'confirmed' && reservation.status !== 'in_progress') {
      return res
        .status(400)
        .json(error('INVALID_STATUS', '체크인 가능한 상태가 아닙니다', { currentStatus: reservation.status }));
    }

    const mergedPhotos = mergePhotoUrls(reservation.luggage_image_urls, photoUrls);

    await query(
      `UPDATE reservations
       SET status = 'in_progress',
           actual_start_time = COALESCE(actual_start_time, NOW()),
           luggage_image_urls = ?,
           updated_at = NOW()
       WHERE id = ? AND store_id = ?`,
      [mergedPhotos.length ? JSON.stringify(mergedPhotos) : null, id, storeId]
    );

    return res.json(success({ id, status: 'in_progress', photos: mergedPhotos }, '체크인 완료'));
  } catch (err) {
    console.error('[storeCheckin] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

// 보관함 할당: 겹치는 예약이 없는 available 보관함을 하나 선택
const assignAvailableStorage = async (storeId, startTime, endTime, storageType) => {
  const rows = await query(
    `SELECT s.id, s.number
     FROM storages s
     WHERE s.store_id = ?
       AND s.status = 'available'
       AND s.type = ?
       AND NOT EXISTS (
         SELECT 1 FROM reservations r
         WHERE r.storage_id = s.id
           AND r.status IN ('confirmed','in_progress')
           AND r.start_time < ?
           AND r.end_time > ?
       )
     ORDER BY s.number
     LIMIT 1`,
    [storeId, storageType, endTime, startTime]
  );
  return rows && rows.length > 0 ? rows[0] : null;
};

const releaseStorageIfAny = async (reservation) => {
  if (reservation?.storage_id) {
    await query('UPDATE storages SET status = ? WHERE id = ?', ['available', reservation.storage_id]);
  }
};

const mergePhotoUrls = (existingJson, newUrls) => {
  try {
    const current = existingJson ? JSON.parse(existingJson) : [];
    if (!Array.isArray(current)) return newUrls || [];
    return [...current, ...(newUrls || [])];
  } catch {
    return newUrls || [];
  }
};

// 매장용 헬퍼: 특정 예약 조회 (store 기준)
const findStoreReservation = async (reservationId, storeId) => {
  const rows = await query(
    `SELECT id, store_id, customer_id, status, start_time, end_time, storage_id, storage_number, requested_storage_type, luggage_image_urls
     FROM reservations WHERE id = ? AND store_id = ? LIMIT 1`,
    [reservationId, storeId]
  );
  return rows && rows.length > 0 ? rows[0] : null;
};

// 고객용 헬퍼: 특정 고객의 예약 조회
const findCustomerReservation = async (reservationId, customerId) => {
  const rows = await query(
    `SELECT id, store_id, customer_id, status, start_time, end_time, storage_id, storage_number, requested_storage_type
     FROM reservations WHERE id = ? AND customer_id = ? LIMIT 1`,
    [reservationId, customerId]
  );
  return rows && rows.length > 0 ? rows[0] : null;
};

export const approveReservation = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const rows = await query(
      `SELECT id, store_id, status, start_time, end_time, storage_id, storage_number, requested_storage_type
       FROM reservations WHERE id = ? AND store_id = ? LIMIT 1`,
      [id, storeId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다'));
    }
    const reservation = rows[0];
    const startTime = reservation.start_time;
    const endTime = reservation.end_time;
    const storageType = reservation.requested_storage_type;

    // 이미 저장된 보관함이 없으면 새로 할당
    let storageId = reservation.storage_id;
    let storageNumber = reservation.storage_number;
    if (!storageId) {
      const available = await assignAvailableStorage(storeId, startTime, endTime, storageType);
      if (!available) {
        return res
          .status(409)
          .json(error('NO_AVAILABLE_STORAGE', '해당 시간에 사용 가능한 보관함이 없습니다', { storeId, startTime, endTime }));
      }
      storageId = available.id;
      storageNumber = available.number;
      await query('UPDATE storages SET status = ?, updated_at = NOW() WHERE id = ?', ['occupied', storageId]);
    }

    await query(
      `UPDATE reservations
       SET status = 'confirmed', storage_id = ?, storage_number = ?, updated_at = NOW()
       WHERE id = ? AND store_id = ?`,
      [storageId, storageNumber, id, storeId]
    );

    return res.json(
      success({ id, status: 'confirmed', storageId, storageNumber }, '예약이 승인되었고 보관함이 배정되었습니다')
    );
  } catch (err) {
    console.error('[approveReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

const updateStatus = async (req, res, newStatus, successMessage) => {
  const { id } = req.params;
  const storeId = req.storeId;
  try {
    if (!ALLOWED_STATUSES.includes(newStatus)) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '허용되지 않는 상태입니다', { allowed: ALLOWED_STATUSES, received: newStatus }));
    }

    const rows = await query(
      'SELECT id, store_id, storage_id FROM reservations WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );
    const reservation = rows && rows.length > 0 ? rows[0] : null;
    if (!reservation) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다'));
    }

    const result = await query('UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ? AND store_id = ?', [
      newStatus,
      id,
      storeId,
    ]);

    // 완료/반납/취소/거절 시 보관함 반환
    const shouldRelease = ['cancelled', 'rejected', 'completed', 'returned'].includes(newStatus);
    if (shouldRelease && reservation?.storage_id) {
      await query('UPDATE storages SET status = ? WHERE id = ?', ['available', reservation.storage_id]);
    }

    return res.json(success({ id, status: newStatus }, successMessage));
  } catch (err) {
    console.error(`[updateStatus:${newStatus}] error:`, err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const rejectReservation = (req, res) => updateStatus(req, res, 'rejected', '예약이 거절되었습니다');
export const cancelReservation = (req, res) => updateStatus(req, res, 'cancelled', '예약이 취소되었습니다');

export const updateReservationStatus = (req, res) => {
  let newStatus = (req.body.status || '').trim();
  if (!newStatus) {
    return res.status(400).json(error('VALIDATION_ERROR', '변경할 상태가 필요합니다', { required: ['status'] }));
  }
  // 호환 상태값 매핑 (스키마에 없는 approved/active 등을 정합 값으로 변환)
  const normalize = {
    approved: 'confirmed',
    active: 'in_progress',
  };
  if (normalize[newStatus]) {
    newStatus = normalize[newStatus];
  }

    // confirmed 요청이 오면 보관함 배정까지 수행하는 approveReservation 로직을 재사용
  if (newStatus === 'confirmed') {
    return approveReservation(req, res);
  }

  return updateStatus(req, res, newStatus, '예약 상태가 변경되었습니다');
};
