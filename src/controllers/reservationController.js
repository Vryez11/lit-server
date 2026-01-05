
/**
 * Reservation controller
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const toMySQLDateTime = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

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
    } = req.body;

    if (!customerName || !phoneNumber || !startTime || !duration || !bagCount || !storeId) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '필수 정보가 누락되었습니다', {
          required: ['storeId', 'customerName', 'phoneNumber', 'startTime', 'duration', 'bagCount'],
        })
      );
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
         status, start_time, end_time, request_time, duration, bag_count,
         total_amount, message, special_requests, luggage_image_urls,
         payment_status, payment_method, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        reservationId,
        storeId,
        customerId,
        customerName,
        phoneNumber,
        email || null,
        'pending',
        toMySQLDateTime(startTime),
        toMySQLDateTime(calculatedEndTime),
        toMySQLDateTime(requestTime || new Date().toISOString()),
        duration,
        bagCount,
        price || 0,
        message || null,
        specialRequests || null,
        luggageImageUrls ? JSON.stringify(luggageImageUrls) : null,
        'pending',
        paymentMethod,
      ]
    );

    const [newReservation] = await query(
      `SELECT
         id, store_id as storeId, customer_id as customerId,
         customer_name as customerName, customer_phone as phoneNumber,
         customer_email as email, status, start_time as startTime,
         end_time as endTime, request_time as requestTime, duration,
         bag_count as bagCount, total_amount as price, message,
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
         bag_count as bagCount, total_amount as price, message,
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
         bag_count as bagCount, total_amount as price, message,
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

const updateStatus = async (req, res, newStatus, successMessage) => {
  const { id } = req.params;
  const storeId = req.storeId;
  try {
    const result = await query('UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ? AND store_id = ?', [
      newStatus,
      id,
      storeId,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json(error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다'));
    }
    return res.json(success({ id, status: newStatus }, successMessage));
  } catch (err) {
    console.error(`[updateStatus:${newStatus}] error:`, err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

export const approveReservation = (req, res) => updateStatus(req, res, 'approved', '예약이 승인되었습니다');
export const rejectReservation = (req, res) => updateStatus(req, res, 'rejected', '예약이 거절되었습니다');
export const cancelReservation = (req, res) => updateStatus(req, res, 'cancelled', '예약이 취소되었습니다');

export const updateReservationStatus = (req, res) => {
  const { status: newStatus } = req.body;
  if (!newStatus) {
    return res.status(400).json(error('VALIDATION_ERROR', '변경할 상태가 필요합니다', { required: ['status'] }));
  }
  return updateStatus(req, res, newStatus, '예약 상태가 변경되었습니다');
};
