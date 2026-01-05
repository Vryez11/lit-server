/**
 * ?ˆì•½ ê´€ë¦?ì»¨íŠ¸ë¡¤ëŸ¬
 * Phase 3 - ?ˆì•½ ê´€ë¦?APIs
 */

import { success, error } from '../utils/response.js';
import { query, pool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

/**
 * ?ˆì•½ ?ì„±
 * POST /api/reservations
 */
export const createReservation = async (req, res) => {
  try {
    const storeId = req.storeId || req.body.storeId; // ë§¤ì¥ ?±ì´ ?„ë‹Œ ê³ ê° ?±ì—?œë„ ?¸ì¶œ ê°€??
    const {
      customerName,
      phoneNumber,
      email,
      requestTime,
      startTime,
      endTime,
      duration,
      price,
      bagCount,
      message,
      specialRequests,
      luggageImageUrls,
      paymentMethod = 'card'
    } = req.body;

    // ?„ìˆ˜ ?„ë“œ ê²€ì¦?
    if (!customerName || !phoneNumber || !startTime || !duration || !bagCount) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '?„ìˆ˜ ?•ë³´ê°€ ?„ë½?˜ì—ˆ?µë‹ˆ??, {
          required: ['customerName', 'phoneNumber', 'startTime', 'duration', 'bagCount']
        })
      );
    }

    // ë§¤ì¥ ID ?•ì¸
    if (!storeId) {
      return res.status(400).json(
        error('VALIDATION_ERROR', 'ë§¤ì¥ IDê°€ ?„ìš”?©ë‹ˆ??)
      );
    }

    // ? ì§œë¥?MySQL DATETIME ?•ì‹?¼ë¡œ ë³€?˜í•˜???¨ìˆ˜
    const toMySQLDateTime = (dateString) => {
      if (!dateString) return null;
      const date = new Date(dateString);
      // MySQL DATETIME ?•ì‹: 'YYYY-MM-DD HH:MM:SS'
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    // ?ˆì•½ ID ?ì„±
    const reservationId = `res_${uuidv4()}`;

    // ì¢…ë£Œ ?œê°„ ê³„ì‚° (endTime???†ìœ¼ë©?startTime + duration?¼ë¡œ ê³„ì‚°)
    let calculatedEndTime = endTime;
    if (!calculatedEndTime && startTime && duration) {
      const start = new Date(startTime);
      start.setHours(start.getHours() + duration);
      calculatedEndTime = start.toISOString();
    }

    // ê³ ê° ID ?ì„± (?¤ì œë¡œëŠ” ê³ ê° ?±ì—???„ë‹¬ë°›ì•„????
    const customerId = req.customerId || req.body.customerId || `customer_${Date.now()}`;

    // ?ˆì•½ ?ì„±
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
        'pending', // ì´ˆê¸° ?íƒœ???€ê¸°ì¤‘
        toMySQLDateTime(startTime),
        toMySQLDateTime(calculatedEndTime),
        toMySQLDateTime(requestTime || new Date().toISOString()),
        duration,
        bagCount,
        price || 0,
        message || null,
        specialRequests || null,
        luggageImageUrls ? JSON.stringify(luggageImageUrls) : null,
        'pending', // ê²°ì œ ?íƒœ
        paymentMethod
      ]
    );

    // ?ì„±???ˆì•½ ì¡°íšŒ
    const [newReservation] = await query(
      `SELECT
        id, store_id as storeId, customer_id as customerId,
        customer_name as customerName, customer_phone as phoneNumber,
        customer_email as email, status, start_time as startTime,
        end_time as endTime, request_time as requestTime, duration,
        bag_count as bagCount, total_amount as price, message,
        special_requests as specialRequests, payment_status as paymentStatus,
        payment_method as paymentMethod, created_at as createdAt
      FROM reservations
      WHERE id = ?`,
      [reservationId]
    );

    return res.status(201).json(
      success({
        ...newReservation,
        phoneNumber: newReservation.phoneNumber, // Flutter ?¸í™˜??
        price: newReservation.price // Flutter ?¸í™˜??
      }, '?ˆì•½???±ê³µ?ìœ¼ë¡??ì„±?˜ì—ˆ?µë‹ˆ??)
    );
  } catch (err) {
    console.error('?ˆì•½ ?ì„± ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message
      })
    );
  }
};

/**
 * ?ˆì•½ ëª©ë¡ ì¡°íšŒ
 * GET /api/reservations
 */
export const getReservations = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      status: statusFilter,
      date,
      customerId,
      page = 1,
      limit = 20,
    } = req.query;

    // ?„í„° ì¡°ê±´ êµ¬ì„±
    const conditions = ['store_id = ?'];
    const params = [storeId];

    if (statusFilter) {
      conditions.push('status = ?');
      params.push(statusFilter);
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

    // ?„ì²´ ê°œìˆ˜ ì¡°íšŒ
    const countResult = await query(
      `SELECT COUNT(*) as total FROM reservations WHERE ${whereClause}`,
      params
    );
    const totalItems = countResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    // ?˜ì´ì§€?¤ì´??ê³„ì‚°
    const offset = (page - 1) * limit;

    // ?ˆì•½ ëª©ë¡ ì¡°íšŒ
    const reservations = await query(
      `SELECT
        r.id, r.store_id as storeId, r.customer_id as customerId,
        r.customer_name as customerName, r.customer_phone as customerPhone,
        r.customer_email as customerEmail,
        r.storage_id as storageId, r.storage_number as storageNumber,
        r.status, r.start_time as startTime, r.end_time as endTime,
        r.request_time as requestTime, r.actual_start_time as actualStartTime,
        r.actual_end_time as actualEndTime, r.duration,
        r.bag_count as bagCount, r.total_amount as totalAmount,
        r.message, r.special_requests as specialRequests,
        r.luggage_image_urls as luggageImageUrls,
        r.payment_status as paymentStatus, r.payment_method as paymentMethod,
        r.qr_code as qrCode, r.created_at as createdAt, r.updated_at as updatedAt
      FROM reservations r
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    // ?‘ë‹µ ?°ì´??êµ¬ì„±
    const formattedReservations = reservations.map(reservation => {
      // luggage_image_urls JSON ?Œì‹±
      let luggageImageUrls = [];
      if (reservation.luggageImageUrls) {
        try {
          luggageImageUrls = typeof reservation.luggageImageUrls === 'string'
            ? JSON.parse(reservation.luggageImageUrls)
            : reservation.luggageImageUrls;
        } catch (e) {
          console.error('[getReservations] luggage_image_urls ?Œì‹± ?¤íŒ¨:', e);
        }
      }

      return {
        id: reservation.id,
        customerName: reservation.customerName,
        phoneNumber: reservation.customerPhone, // Flutter ?? phoneNumber
        email: reservation.customerEmail,
        requestTime: reservation.requestTime,
        startTime: reservation.startTime,
        duration: reservation.duration,
        price: reservation.totalAmount, // Flutter ?? price
        bagCount: reservation.bagCount,
        message: reservation.message || '',
        specialRequests: reservation.specialRequests,
        luggageImageUrls,
        status: reservation.status,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
      };
    });

    return res.json(
      success(
        {
          reservations: formattedReservations,
          pagination: {
            currentPage: Number(page),
            totalPages,
            totalItems,
            itemsPerPage: Number(limit),
          },
        },
        '?ˆì•½ ëª©ë¡ ì¡°íšŒ ?±ê³µ'
      )
    );
  } catch (err) {
    console.error('?ˆì•½ ëª©ë¡ ì¡°íšŒ ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  }
};

/**
 * ?ˆì•½ ?¨ì¼ ì¡°íšŒ
 * GET /api/reservations/:id
 */
export const getReservation = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;

    const reservations = await query(
      `SELECT
        r.id, r.store_id as storeId, r.customer_id as customerId,
        r.customer_name as customerName, r.customer_phone as customerPhone,
        r.customer_email as customerEmail,
        r.storage_id as storageId, r.storage_number as storageNumber,
        r.status, r.start_time as startTime, r.end_time as endTime,
        r.request_time as requestTime, r.actual_start_time as actualStartTime,
        r.actual_end_time as actualEndTime, r.duration,
        r.bag_count as bagCount, r.total_amount as totalAmount,
        r.message, r.special_requests as specialRequests,
        r.luggage_image_urls as luggageImageUrls,
        r.payment_status as paymentStatus, r.payment_method as paymentMethod,
        r.qr_code as qrCode, r.created_at as createdAt, r.updated_at as updatedAt,
        s.number as storageNumberDetail, s.type as storageType
      FROM reservations r
      LEFT JOIN storages s ON r.storage_id = s.id
      WHERE r.id = ? AND r.store_id = ?
      LIMIT 1`,
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '?ˆì•½??ì°¾ì„ ???†ìŠµ?ˆë‹¤')
      );
    }

    const reservation = reservations[0];

    // luggage_image_urls JSON ?Œì‹±
    let luggageImageUrls = [];
    if (reservation.luggageImageUrls) {
      try {
        luggageImageUrls = typeof reservation.luggageImageUrls === 'string'
          ? JSON.parse(reservation.luggageImageUrls)
          : reservation.luggageImageUrls;
      } catch (e) {
        console.error('[getReservation] luggage_image_urls ?Œì‹± ?¤íŒ¨:', e);
      }
    }

    const result = {
      id: reservation.id,
      customerName: reservation.customerName,
      phoneNumber: reservation.customerPhone, // Flutter ?? phoneNumber
      email: reservation.customerEmail,
      requestTime: reservation.requestTime,
      startTime: reservation.startTime,
      duration: reservation.duration,
      price: reservation.totalAmount, // Flutter ?? price
      bagCount: reservation.bagCount,
      message: reservation.message || '',
      specialRequests: reservation.specialRequests,
      luggageImageUrls,
      status: reservation.status,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };

    return res.json(success(result, '?ˆì•½ ì¡°íšŒ ?±ê³µ'));
  } catch (err) {
    console.error('?ˆì•½ ì¡°íšŒ ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  }
};

/**
 * ?ˆì•½ ?¹ì¸
 * PUT /api/reservations/:id/approve
 */
export const approveReservation = async (req, res) => {
  try {
    const storeId = req.storeId || req.body.storeId;
    const { id } = req.params;
    const { storageId, storageNumber } = req.body;

    // ?ˆì•½ ì¡´ì¬ ë°??íƒœ ?•ì¸
    const reservations = await query(
      'SELECT status FROM reservations WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '?ˆì•½??ì°¾ì„ ???†ìŠµ?ˆë‹¤')
      );
    }

    // pending ?ëŠ” pending_approval ?íƒœë§??¹ì¸ ê°€??
    if (reservations[0].status !== 'pending' && reservations[0].status !== 'pending_approval') {
      return res.status(400).json(
        error('INVALID_STATUS', '?¹ì¸ ê°€?¥í•œ ?íƒœê°€ ?„ë‹™?ˆë‹¤', {
          currentStatus: reservations[0].status,
        })
      );
    }

    // ë³´ê??¨ì´ ì§€?•ëœ ê²½ìš° ?íƒœ ?•ì¸ ë°??…ë°?´íŠ¸
    if (storageId) {
      const storages = await query(
        'SELECT status FROM storages WHERE id = ? AND store_id = ? LIMIT 1',
        [storageId, storeId]
      );

      if (!storages || storages.length === 0) {
        return res.status(404).json(
          error('STORAGE_NOT_FOUND', 'ë³´ê??¨ì„ ì°¾ì„ ???†ìŠµ?ˆë‹¤')
        );
      }

      if (storages[0].status !== 'available') {
        return res.status(400).json(
          error('STORAGE_NOT_AVAILABLE', '?¬ìš© ê°€?¥í•œ ë³´ê??¨ì´ ?„ë‹™?ˆë‹¤', {
            currentStatus: storages[0].status,
          })
        );
      }

      // ë³´ê????íƒœë¥?occupiedë¡?ë³€ê²?
      await query(
        'UPDATE storages SET status = \'occupied\', updated_at = NOW() WHERE id = ? AND store_id = ?',
        [storageId, storeId]
      );
    }

    // ?ˆì•½ ?íƒœë¥?confirmedë¡?ë³€ê²?
    await query(
      `UPDATE reservations
       SET status = 'confirmed', storage_id = ?, storage_number = ?, updated_at = NOW()
       WHERE id = ? AND store_id = ?`,
      [storageId || null, storageNumber || null, id, storeId]
    );

    // ?…ë°?´íŠ¸???ˆì•½ ì¡°íšŒ
    const updatedReservations = await query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, storage_id as storageId, storage_number as storageNumber,
        start_time as startTime, end_time as endTime, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(success(updatedReservations[0], '?ˆì•½ ?¹ì¸ ?±ê³µ'));
  } catch (err) {
    console.error('?ˆì•½ ?¹ì¸ ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  }
};

/**
 * ?ˆì•½ ê±°ë? (?ë™ ?˜ë¶ˆ ?¬í•¨)
 * PUT /api/reservations/:id/reject
 */
export const rejectReservation = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const storeId = req.storeId || req.body.storeId;
    const { id } = req.params;
    const { reason } = req.body;

    await connection.beginTransaction();

    // 1. ?ˆì•½ ?•ë³´ ì¡°íšŒ (FOR UPDATEë¡???ê±¸ê¸°)
    const [reservations] = await connection.query(
      'SELECT * FROM reservations WHERE id = ? AND store_id = ? FOR UPDATE',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      await connection.rollback();
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '?ˆì•½??ì°¾ì„ ???†ìŠµ?ˆë‹¤')
      );
    }

    const reservation = reservations[0];

    // 2. ?´ë? ì²˜ë¦¬???ˆì•½?¸ì? ?•ì¸
    if (reservation.status !== 'pending' && reservation.status !== 'pending_approval') {
      await connection.rollback();
      return res.status(400).json(
        error('INVALID_STATUS', 'ê±°ë??????†ëŠ” ?ˆì•½ ?íƒœ?…ë‹ˆ??, {
          currentStatus: reservation.status,
        })
      );
    }

    // 3. ê²°ì œ ?•ë³´ ì¡°íšŒ
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE reservation_id = ? AND status = "SUCCESS"',
      [id]
    );

    let refundResult = null;
    const payment = payments && payments.length > 0 ? payments[0] : null;

    // 4. ê²°ì œê°€ ?„ë£Œ??ê²½ìš° ?ë™ ?˜ë¶ˆ
    if (payment) {
      const secretKey = process.env.TOSS_SECRET_KEY;
      const encodedKey = Buffer.from(secretKey + ':').toString('base64');

      try {
        // ? ìŠ¤?˜ì´ë¨¼ì¸  ?˜ë¶ˆ API ?¸ì¶œ
        const tossResponse = await axios.post(
          `https://api.tosspayments.com/v1/payments/${payment.pg_payment_key}/cancel`,
          {
            cancelReason: reason || 'ê°€ê²??¬ì •?¼ë¡œ ?ˆì•½ ê±°ë?',
          },
          {
            headers: {
              Authorization: `Basic ${encodedKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        refundResult = tossResponse.data;

        // ê²°ì œ ?íƒœ ?…ë°?´íŠ¸
        await connection.query(
          `UPDATE payments
           SET status = 'CANCELED',
               canceled_at = NOW(),
               updated_at = NOW()
           WHERE id = ?`,
          [payment.id]
        );


      } catch (refundError) {
        console.error('?˜ë¶ˆ ?¤íŒ¨:', refundError);
        await connection.rollback();
        
        return res.status(500).json(
          error('REFUND_FAILED', '?˜ë¶ˆ ì²˜ë¦¬ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
            detail: refundError.response?.data || refundError.message,
          })
        );
      }
    }

    // 5. ?ˆì•½ ?íƒœ ?…ë°?´íŠ¸
    await connection.query(
      `UPDATE reservations
       SET status = 'rejected',
           payment_status = ?,
           message = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        payment ? 'refunded' : reservation.payment_status,
        reason || '?í¬ ?¬ì •?¼ë¡œ ?ˆì•½??ê±°ë??˜ì—ˆ?µë‹ˆ??,
        id,
      ]
    );

    await connection.commit();

    // 6. ?…ë°?´íŠ¸???ˆì•½ ì¡°íšŒ
    const [updatedReservations] = await connection.query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, payment_status as paymentStatus, message, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(
      success({
        reservation: updatedReservations[0],
        refunded: !!payment,
        refund_amount: payment?.amount_total,
        refund_data: refundResult,
      }, '?ˆì•½ ê±°ë? ë°??˜ë¶ˆ ì²˜ë¦¬ ?„ë£Œ')
    );

  } catch (err) {
    await connection.rollback();
    console.error('?ˆì•½ ê±°ë? ì¤??ëŸ¬:', err);
    
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  } finally {
    connection.release();
  }
};

/**
 * ?ˆì•½ ì·¨ì†Œ (?ë™ ?˜ë¶ˆ ?¬í•¨)
 * PUT /api/reservations/:id/cancel
 * ê°€ê²Œì—???ë™ ?¹ì¸???ˆì•½??ì·¨ì†Œ?????¬ìš©
 */
export const cancelReservation = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const { reason } = req.body;

    await connection.beginTransaction();

    // 1. ?ˆì•½ ?•ë³´ ì¡°íšŒ (FOR UPDATEë¡???ê±¸ê¸°)
    const [reservations] = await connection.query(
      'SELECT * FROM reservations WHERE id = ? AND store_id = ? FOR UPDATE',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      await connection.rollback();
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '?ˆì•½??ì°¾ì„ ???†ìŠµ?ˆë‹¤')
      );
    }

    const reservation = reservations[0];

    // 2. ?íƒœ ê²€ì¦?
    if (reservation.status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json(
        error('ALREADY_CANCELLED', '?´ë? ì·¨ì†Œ???ˆì•½?…ë‹ˆ??)
      );
    }

    if (reservation.status === 'completed') {
      await connection.rollback();
      return res.status(400).json(
        error('CANNOT_CANCEL_COMPLETED', '?„ë£Œ???ˆì•½?€ ì·¨ì†Œ?????†ìŠµ?ˆë‹¤')
      );
    }

    // 3. ê²°ì œ ?•ë³´ ì¡°íšŒ
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE reservation_id = ? AND status = "SUCCESS"',
      [id]
    );

    let refundResult = null;
    const payment = payments && payments.length > 0 ? payments[0] : null;

    // 4. ê²°ì œê°€ ?„ë£Œ??ê²½ìš° ?ë™ ?˜ë¶ˆ
    if (payment) {
      const secretKey = process.env.TOSS_SECRET_KEY;
      const encodedKey = Buffer.from(secretKey + ':').toString('base64');

      try {
        // ? ìŠ¤?˜ì´ë¨¼ì¸  ?˜ë¶ˆ API ?¸ì¶œ
        const tossResponse = await axios.post(
          `https://api.tosspayments.com/v1/payments/${payment.pg_payment_key}/cancel`,
          {
            cancelReason: reason || 'ê°€ê²??¬ì •?¼ë¡œ ?ˆì•½ ì·¨ì†Œ',
          },
          {
            headers: {
              Authorization: `Basic ${encodedKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        refundResult = tossResponse.data;

        // ê²°ì œ ?íƒœ ?…ë°?´íŠ¸
        await connection.query(
          `UPDATE payments
           SET status = 'CANCELED',
               canceled_at = NOW(),
               updated_at = NOW()
           WHERE id = ?`,
          [payment.id]
        );


      } catch (refundError) {
        console.error('?˜ë¶ˆ ?¤íŒ¨:', refundError);
        await connection.rollback();
        
        return res.status(500).json(
          error('REFUND_FAILED', '?˜ë¶ˆ ì²˜ë¦¬ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
            detail: refundError.response?.data || refundError.message,
          })
        );
      }
    }

    // 5. ë³´ê??¨ì´ ? ë‹¹??ê²½ìš° ?íƒœë¥?availableë¡?ë³€ê²?
    if (reservation.storage_id) {
      await connection.query(
        'UPDATE storages SET status = \'available\', updated_at = NOW() WHERE id = ? AND store_id = ?',
        [reservation.storage_id, storeId]
      );
    }

    // 6. ?ˆì•½ ?íƒœ ?…ë°?´íŠ¸
    await connection.query(
      `UPDATE reservations
       SET status = 'cancelled',
           payment_status = ?,
           message = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        payment ? 'refunded' : reservation.payment_status,
        reason || 'ê°€ê²??¬ì •?¼ë¡œ ?ˆì•½ ì·¨ì†Œ',
        id,
      ]
    );

    await connection.commit();

    // 7. ?…ë°?´íŠ¸???ˆì•½ ì¡°íšŒ
    const [updatedReservations] = await connection.query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, payment_status as paymentStatus, message, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(
      success({
        reservation: updatedReservations[0],
        refunded: !!payment,
        refund_amount: payment?.amount_total,
        refund_data: refundResult,
      }, '?ˆì•½ ì·¨ì†Œ ë°??˜ë¶ˆ ì²˜ë¦¬ ?„ë£Œ')
    );

  } catch (err) {
    await connection.rollback();
    console.error('?ˆì•½ ì·¨ì†Œ ì¤??ëŸ¬:', err);
    
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  } finally {
    connection.release();
  }
};

/**
 * ?ˆì•½ ?íƒœ ë³€ê²?
 * PUT /api/reservations/:id/status
 */
export const updateReservationStatus = async (req, res) => {
  try {
    const storeId = req.storeId || req.body.storeId;
    const { id } = req.params;
    const { status: newStatus } = req.body;

    // ?íƒœê°?ê²€ì¦?
    const validStatuses = ['pending', 'confirmed', 'rejected', 'in_progress', 'completed', 'cancelled'];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '? íš¨???íƒœê°’ì´ ?„ìš”?©ë‹ˆ??, {
          validStatuses,
        })
      );
    }

    // ?ˆì•½ ì¡´ì¬ ?•ì¸
    if (!storeId) {
      return res.status(400).json(
        error('VALIDATION_ERROR', 'storeIdê°€ ?„ìš”?©ë‹ˆ??)
      );
    }

    const reservations = await query(
      'SELECT status, storage_id FROM reservations WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '?ˆì•½??ì°¾ì„ ???†ìŠµ?ˆë‹¤')
      );
    }

    const currentStatus = reservations[0].status;
    const storageId = reservations[0].storage_id;

    // ?íƒœ ?„í™˜ ë¡œì§ ì²˜ë¦¬
    if (newStatus === 'in_progress' && currentStatus === 'confirmed') {
      // ?ˆì•½ ?œì‘ - actual_start_time ?¤ì •
      await query(
        'UPDATE reservations SET status = ?, actual_start_time = NOW(), updated_at = NOW() WHERE id = ? AND store_id = ?',
        [newStatus, id, storeId]
      );
    } else if (newStatus === 'completed' && (currentStatus === 'in_progress' || currentStatus === 'confirmed')) {
      // ?ˆì•½ ?„ë£Œ - actual_end_time ?¤ì •, ë³´ê????íƒœë¥?availableë¡?ë³€ê²?
      await query(
        'UPDATE reservations SET status = ?, actual_end_time = NOW(), updated_at = NOW() WHERE id = ? AND store_id = ?',
        [newStatus, id, storeId]
      );

      if (storageId) {
        await query(
          'UPDATE storages SET status = \'available\', updated_at = NOW() WHERE id = ? AND store_id = ?',
          [storageId, storeId]
        );
      }
    } else {
      // ?¼ë°˜?ì¸ ?íƒœ ë³€ê²?
      await query(
        'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ? AND store_id = ?',
        [newStatus, id, storeId]
      );
    }

    // ?…ë°?´íŠ¸???ˆì•½ ì¡°íšŒ
    const updatedReservations = await query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, actual_start_time as actualStartTime,
        actual_end_time as actualEndTime, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(success(updatedReservations[0], '?ˆì•½ ?íƒœ ë³€ê²??±ê³µ'));
  } catch (err) {
    console.error('?ˆì•½ ?íƒœ ë³€ê²?ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  }
};
