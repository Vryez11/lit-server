/**
 * ?¹í›… ?œë¹„??
 * ? ìŠ¤?˜ì´ë¨¼ì¸  ?¹í›… ì²˜ë¦¬ ë¹„ì¦ˆ?ˆìŠ¤ ë¡œì§
 */

import { pool } from '../config/database.js';

/**
 * ? ìŠ¤ ?íƒœë¥??°ë¦¬ ?œìŠ¤???íƒœë¡?ë§¤í•‘
 */
export function mapTossStatusToOurStatus(tossStatus) {
  const statusMap = {
    'READY': 'PENDING',
    'IN_PROGRESS': 'PENDING',
    'WAITING_FOR_DEPOSIT': 'PENDING',
    'DONE': 'SUCCESS',
    'CANCELED': 'CANCELED',
    'PARTIAL_CANCELED': 'CANCELED',
    'ABORTED': 'FAILED',
    'EXPIRED': 'FAILED',
  };

  return statusMap[tossStatus] || 'PENDING';
}

/**
 * ?íƒœ ?„ì´ ê²€ì¦?
 */
export function isValidStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'PENDING': ['SUCCESS', 'FAILED', 'CANCELED'],
    'SUCCESS': ['CANCELED', 'REFUNDED'],
    'FAILED': [],
    'CANCELED': [],
    'REFUNDED': [],
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * ?¹í›… ë©±ë“±??ì²´í¬
 */
export async function checkWebhookIdempotency(connection, orderId, eventType, status) {
  const [existingWebhooks] = await connection.query(
    `SELECT * FROM payment_webhooks 
     WHERE pg_order_id = ? 
     AND event_type = ? 
     AND status = ?
     AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [orderId, eventType, status]
  );

  return existingWebhooks.length > 0;
}

/**
 * ?¹í›… ?´ë ¥ ?€??
 */
export async function saveWebhookHistory(connection, webhookData) {
  const {
    paymentId,
    orderId,
    paymentKey,
    eventType,
    status,
    rawData,
  } = webhookData;

  const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  await connection.query(
    `INSERT INTO payment_webhooks (
      id,
      payment_id,
      pg_order_id,
      pg_payment_key,
      event_type,
      status,
      webhook_data,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      webhookId,
      paymentId,
      orderId,
      paymentKey || null,
      eventType,
      status,
      JSON.stringify(rawData),
    ]
  );

  return webhookId;
}

/**
 * ê²°ì œ ?íƒœ ë³€ê²?ì²˜ë¦¬
 */
export async function handlePaymentStatusChanged(connection, payment, data) {
  const { paymentKey, status, approvedAt, totalAmount, method } = data;
  
  const ourStatus = mapTossStatusToOurStatus(status);

  if (ourStatus === 'SUCCESS') {
    // ê²°ì œ ?±ê³µ
    await connection.query(
      `UPDATE payments
       SET status = ?,
           pg_payment_key = ?,
           pg_method = ?,
           amount_total = ?,
           paid_at = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        ourStatus,
        paymentKey,
        method || payment.pg_method,
        totalAmount || payment.amount_total,
        approvedAt ? new Date(approvedAt) : new Date(),
        payment.id,
      ]
    );

    // ?°ê²°???ˆì•½???ˆìœ¼ë©??ˆì•½ ?íƒœ???…ë°?´íŠ¸ (ê°€ê²??¹ì¸ ?€ê¸?
    if (payment.reservation_id) {
      await connection.query(
        `UPDATE reservations
         SET status = 'pending_approval',
             payment_status = 'paid',
             updated_at = NOW()
         WHERE id = ?`,
        [payment.reservation_id]
      );

    }


  } else if (ourStatus === 'FAILED') {
    // ê²°ì œ ?¤íŒ¨
    await connection.query(
      `UPDATE payments
       SET status = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [ourStatus, payment.id]
    );

    // ?ˆì•½???¤íŒ¨ ì²˜ë¦¬
    if (payment.reservation_id) {
      await connection.query(
        `UPDATE reservations
         SET payment_status = 'failed',
             updated_at = NOW()
         WHERE id = ?`,
        [payment.reservation_id]
      );
    }

  }
}

/**
 * ê²°ì œ ì·¨ì†Œ ì²˜ë¦¬
 */
export async function handlePaymentCanceled(connection, payment, data) {
  const { paymentKey, cancels } = data;

  // 1. ê²°ì œ ì·¨ì†Œ
  await connection.query(
    `UPDATE payments
     SET status = 'CANCELED',
         canceled_at = NOW(),
         updated_at = NOW()
     WHERE id = ?`,
    [payment.id]
  );

  // 2. ?ˆì•½??ì·¨ì†Œ ì²˜ë¦¬
  if (payment.reservation_id) {
    await connection.query(
      `UPDATE reservations
       SET status = 'canceled',
           payment_status = 'refunded',
           updated_at = NOW()
       WHERE id = ?`,
      [payment.reservation_id]
    );

  }

}

/**
 * ?¹í›… ì²˜ë¦¬ ë©”ì¸ ë¡œì§
 */
export async function processWebhook(webhookData) {
  let connection;

  try {
    const {
      eventType,
      createdAt,
      data: {
        paymentKey,
        orderId,
        status,
        approvedAt,
        totalAmount,
        method,
        cancels,
      } = {},
    } = webhookData;

    // 1. ?„ìˆ˜ ?„ë“œ ê²€ì¦?
    if (!eventType || !orderId) {
      throw new Error('?¹í›… ?„ìˆ˜ ?„ë“œ ?„ë½');
    }

    // 2. ?¸ëžœ??…˜ ?œìž‘
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3. ê¸°ì¡´ ê²°ì œ ?•ë³´ ì¡°íšŒ (FOR UPDATEë¡???ê±¸ê¸°)
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE pg_order_id = ? FOR UPDATE',
      [orderId]
    );

    if (payments.length === 0) {
      throw new Error(`ì¡´ìž¬?˜ì? ?ŠëŠ” ì£¼ë¬¸: ${orderId}`);
    }

    const payment = payments[0];

    // 4. ë©±ë“±??ì²´í¬
    const isAlreadyProcessed = await checkWebhookIdempotency(
      connection,
      orderId,
      eventType,
      status
    );

    if (isAlreadyProcessed) {
      await connection.commit();
      return { success: true, message: 'Already processed (idempotent)' };
    }

    // 5. ?¹í›… ?´ë ¥ ?€??
    await saveWebhookHistory(connection, {
      paymentId: payment.id,
      orderId,
      paymentKey,
      eventType,
      status,
      rawData: webhookData,
    });

    // 6. ?íƒœ ?„ì´ ê²€ì¦?
    const currentStatus = payment.status;
    const newStatus = mapTossStatusToOurStatus(status);

    if (!isValidStatusTransition(currentStatus, newStatus)) {
      console.warn(`? ï¸  ?˜ëª»???íƒœ ?„ì´: ${currentStatus} -> ${newStatus}`);
      await connection.commit();
      return { success: false, message: 'Invalid status transition' };
    }

    // 7. ?´ë²¤???€?…ë³„ ì²˜ë¦¬
    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED':
        await handlePaymentStatusChanged(connection, payment, {
          paymentKey,
          status,
          approvedAt,
          totalAmount,
          method,
        });
        break;

      case 'PAYMENT_CANCELED':
        await handlePaymentCanceled(connection, payment, {
          paymentKey,
          cancels,
        });
        break;

      default:
    }

    // 8. ?¸ëžœ??…˜ ì»¤ë°‹
    await connection.commit();

    return { success: true, message: 'Webhook processed successfully' };

  } catch (err) {
    console.error('???¹í›… ì²˜ë¦¬ ?¤íŒ¨:', err);
    
    if (connection) {
      await connection.rollback();
    }

    throw err;

  } finally {
    if (connection) {
      connection.release();
    }
  }
}
