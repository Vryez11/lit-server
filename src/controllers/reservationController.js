
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
        error('VALIDATION_ERROR', '?꾩닔 ?뺣낫媛 ?꾨씫?섏뿀?듬땲??, {
          required: ['storeId', 'customerName', 'phoneNumber', 'startTime', 'duration', 'bagCount', 'storageType'],
        })
      );
    }

    if (!ALLOWED_STORAGE_TYPES.includes(storageType)) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '?덉슜?섏? ?딅뒗 蹂닿?????낆엯?덈떎', { allowed: ALLOWED_STORAGE_TYPES }));
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

    return res.status(201).json(success(newReservation, '?덉빟???앹꽦?섏뿀?듬땲??));
  } catch (err) {
    console.error('[createReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
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
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
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
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '?덉빟??李얠쓣 ???놁뒿?덈떎'));
    }
    return res.json(success(rows[0]));
  } catch (err) {
    console.error('[getReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
  }
};

// 怨좉컼?? 濡쒓렇??怨좉컼???덉빟 紐⑸줉 議고쉶
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
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
  }
};

// 怨좉컼?? 濡쒓렇??怨좉컼???덉빟 ?④굔 議고쉶
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
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '?덉빟??李얠쓣 ???놁뒿?덈떎'));
    }
    return res.json(success(rows[0]));
  } catch (err) {
    console.error('[getCustomerReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
  }
};

// 怨좉컼 泥댄겕?꾩썐: ?곹깭瑜?completed濡??꾪솚, ?ㅼ젣 醫낅즺 ?쒓컙 湲곕줉, 蹂닿???諛섎궔
export const customerCheckout = async (req, res) => {
  try {
    const customerId = req.customerId;
    const { id } = req.params;
    const reservation = await findCustomerReservation(id, customerId);
    if (!reservation) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '?덉빟??李얠쓣 ???놁뒿?덈떎'));
    }
    if (reservation.status !== 'in_progress' && reservation.status !== 'confirmed') {
      return res
        .status(400)
        .json(error('INVALID_STATUS', '泥댄겕?꾩썐 媛?ν븳 ?곹깭媛 ?꾨떃?덈떎', { currentStatus: reservation.status }));
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

    // ?먮룞 諛쒓툒 ?? ?덉빟 ?꾨즺
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

    return res.json(success({ id, status: 'completed' }, '泥댄겕?꾩썐 ?꾨즺'));
  } catch (err) {
    console.error('[customerCheckout] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
  }
};

// 留ㅼ옣 泥댄겕?? ?먯＜媛 ?ъ쭊 ?낅줈????in_progress濡??꾪솚
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
      UPDATE reservations
       SET status = 'in_progress',
           actual_start_time = COALESCE(actual_start_time, NOW()),
           luggage_image_urls = ?,
           updated_at = NOW()
       WHERE id = ? AND store_id = ?,
      [mergedPhotos.length ? JSON.stringify(mergedPhotos) : null, id, storeId]
    );

    // 자동 발급 훅: 체크인 완료(매장 측)
    try {
      await issueCouponsForTrigger({
        customerId: reservation.customer_id,
        storeId,
        trigger: 'checkin_completed',
        reservationId: reservation.id,
      });
    } catch (hookErr) {
      console.warn('[storeCheckin] auto issue skipped:', hookErr?.message);
    }

    return res.json(success({ id, status: 'in_progress', photos: mergedPhotos }, '체크인이 완료되었습니다'));
  } catch (err) {
    console.error('[storeCheckin] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};
// 蹂닿????좊떦: 寃뱀튂???덉빟???녿뒗 available 蹂닿??⑥쓣 ?섎굹 ?좏깮
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

// 留ㅼ옣???ы띁: ?뱀젙 ?덉빟 議고쉶 (store 湲곗?)
const findStoreReservation = async (reservationId, storeId) => {
  const rows = await query(
    `SELECT id, store_id, customer_id, status, start_time, end_time, storage_id, storage_number, requested_storage_type, luggage_image_urls
     FROM reservations WHERE id = ? AND store_id = ? LIMIT 1`,
    [reservationId, storeId]
  );
  return rows && rows.length > 0 ? rows[0] : null;
};

// 怨좉컼???ы띁: ?뱀젙 怨좉컼???덉빟 議고쉶
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
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '?덉빟??李얠쓣 ???놁뒿?덈떎'));
    }
    const reservation = rows[0];
    const startTime = reservation.start_time;
    const endTime = reservation.end_time;
    const storageType = reservation.requested_storage_type;

    // ?대? ??λ맂 蹂닿??⑥씠 ?놁쑝硫??덈줈 ?좊떦
    let storageId = reservation.storage_id;
    let storageNumber = reservation.storage_number;
    if (!storageId) {
      const available = await assignAvailableStorage(storeId, startTime, endTime, storageType);
      if (!available) {
        return res
          .status(409)
          .json(error('NO_AVAILABLE_STORAGE', '?대떦 ?쒓컙???ъ슜 媛?ν븳 蹂닿??⑥씠 ?놁뒿?덈떎', { storeId, startTime, endTime }));
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
      success({ id, status: 'confirmed', storageId, storageNumber }, '?덉빟???뱀씤?섏뿀怨?蹂닿??⑥씠 諛곗젙?섏뿀?듬땲??)
    );
  } catch (err) {
    console.error('[approveReservation] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
  }
};

const updateStatus = async (req, res, newStatus, successMessage) => {
  const { id } = req.params;
  const storeId = req.storeId;
  try {
    if (!ALLOWED_STATUSES.includes(newStatus)) {
      return res
        .status(400)
        .json(error('VALIDATION_ERROR', '?덉슜?섏? ?딅뒗 ?곹깭?낅땲??, { allowed: ALLOWED_STATUSES, received: newStatus }));
    }

    const rows = await query(
      'SELECT id, store_id, storage_id FROM reservations WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );
    const reservation = rows && rows.length > 0 ? rows[0] : null;
    if (!reservation) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '?덉빟??李얠쓣 ???놁뒿?덈떎'));
    }

    const result = await query('UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ? AND store_id = ?', [
      newStatus,
      id,
      storeId,
    ]);

    // ?꾨즺/諛섎궔/痍⑥냼/嫄곗젅 ??蹂닿???諛섑솚
    const shouldRelease = ['cancelled', 'rejected', 'completed', 'returned'].includes(newStatus);
    if (shouldRelease && reservation?.storage_id) {
      await query('UPDATE storages SET status = ? WHERE id = ?', ['available', reservation.storage_id]);
    }

    return res.json(success({ id, status: newStatus }, successMessage));
  } catch (err) {
    console.error(`[updateStatus:${newStatus}] error:`, err);
    return res.status(500).json(error('INTERNAL_ERROR', '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎', { message: err.message }));
  }
};

export const rejectReservation = (req, res) => updateStatus(req, res, 'rejected', '?덉빟??嫄곗젅?섏뿀?듬땲??);
export const cancelReservation = (req, res) => updateStatus(req, res, 'cancelled', '?덉빟??痍⑥냼?섏뿀?듬땲??);

export const updateReservationStatus = (req, res) => {
  let newStatus = (req.body.status || '').trim();
  if (!newStatus) {
    return res.status(400).json(error('VALIDATION_ERROR', '蹂寃쏀븷 ?곹깭媛 ?꾩슂?⑸땲??, { required: ['status'] }));
  }
  // ?명솚 ?곹깭媛?留ㅽ븨 (?ㅽ궎留덉뿉 ?녿뒗 approved/active ?깆쓣 ?뺥빀 媛믪쑝濡?蹂??
  const normalize = {
    approved: 'confirmed',
    active: 'in_progress',
  };
  if (normalize[newStatus]) {
    newStatus = normalize[newStatus];
  }

    // confirmed ?붿껌???ㅻ㈃ 蹂닿???諛곗젙源뚯? ?섑뻾?섎뒗 approveReservation 濡쒖쭅???ъ궗??  if (newStatus === 'confirmed') {
    return approveReservation(req, res);
  }

  return updateStatus(req, res, newStatus, '?덉빟 ?곹깭媛 蹂寃쎈릺?덉뒿?덈떎');
};

