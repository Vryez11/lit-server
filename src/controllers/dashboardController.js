/**
 * ?€?œë³´??ì»¨íŠ¸ë¡¤ëŸ¬
 * Phase 3 - ?€?œë³´???”ì•½ ?•ë³´ API
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';

/**
 * ?€?œë³´???”ì•½ ?•ë³´ ì¡°íšŒ
 * GET /api/dashboard/summary
 */
export const getDashboardSummary = async (req, res) => {
  try {
    const storeId = req.storeId; // auth ë¯¸ë“¤?¨ì–´?ì„œ ?¤ì •

    // 1. ?í¬ ?•ë³´ ì¡°íšŒ
    const stores = await query(
      'SELECT business_name FROM stores WHERE id = ? LIMIT 1',
      [storeId]
    );

    if (!stores || stores.length === 0) {
      return res.status(404).json(
        error('STORE_NOT_FOUND', '?í¬ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤')
      );
    }

    const storeName = stores[0].business_name;

    // 2. ?ˆì•½ ?µê³„ ì¡°íšŒ
    const reservationStats = await query(
      `SELECT
        COUNT(*) as totalReservations,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingReservations,
        SUM(CASE WHEN status = 'active' OR status = 'approved' THEN 1 ELSE 0 END) as activeReservations,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedReservations,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as todayReservations
      FROM reservations
      WHERE store_id = ?`,
      [storeId]
    );

    const {
      totalReservations = 0,
      pendingReservations = 0,
      activeReservations = 0,
      completedReservations = 0,
      todayReservations = 0,
    } = reservationStats[0] || {};

    // 3. ë§¤ì¶œ ?µê³„ ì¡°íšŒ
    const revenueStats = await query(
      `SELECT
        COALESCE(SUM(total_amount), 0) as totalRevenue,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END), 0) as todayRevenue
      FROM reservations
      WHERE store_id = ? AND payment_status = 'paid'`,
      [storeId]
    );

    const {
      totalRevenue = 0,
      todayRevenue = 0,
    } = revenueStats[0] || {};

    // 4. ë³´ê????µê³„ ì¡°íšŒ
    const storageStats = await query(
      `SELECT
        COUNT(*) as totalStorages,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as availableStorages,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupiedStorages
      FROM storages
      WHERE store_id = ?`,
      [storeId]
    );

    const {
      totalStorages = 0,
      availableStorages = 0,
      occupiedStorages = 0,
    } = storageStats[0] || {};

    // ?ìœ ??ê³„ì‚°
    const occupancyRate = totalStorages > 0
      ? (occupiedStorages / totalStorages)
      : 0;

    // 5. ?í¬ ?ì„±???˜ì •??ì¡°íšŒ
    const storeInfo = await query(
      'SELECT created_at, updated_at FROM stores WHERE id = ? LIMIT 1',
      [storeId]
    );

    const createdAt = storeInfo[0]?.created_at || new Date();
    const updatedAt = storeInfo[0]?.updated_at || new Date();

    // 6. ?‘ë‹µ ?°ì´??êµ¬ì„±
    const responseData = {
      storeName: storeName || '',
      totalReservations: Number(totalReservations),
      pendingReservations: Number(pendingReservations),
      activeReservations: Number(activeReservations),
      completedReservations: Number(completedReservations),
      todayReservations: Number(todayReservations),
      totalRevenue: Number(totalRevenue),
      todayRevenue: Number(todayRevenue),
      totalStorages: Number(totalStorages),
      availableStorages: Number(availableStorages),
      occupiedStorages: Number(occupiedStorages),
      occupancyRate: Number(occupancyRate.toFixed(2)),
      createdAt: createdAt ? (createdAt instanceof Date ? createdAt.toISOString() : createdAt) : new Date().toISOString(),
      updatedAt: updatedAt ? (updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt) : new Date().toISOString(),
    };


    return res.json(
      success(
        responseData,
        '?€?œë³´???”ì•½ ?•ë³´ ì¡°íšŒ ?±ê³µ'
      )
    );
  } catch (err) {
    console.error('?€?œë³´???”ì•½ ?•ë³´ ì¡°íšŒ ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  }
};

/**
 * ?€?œë³´???µê³„ ì¡°íšŒ
 * GET /api/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { period = 'monthly' } = req.query; // daily, weekly, monthly, yearly

    // ê¸°ê°„ ?¤ì •
    let dateFilter = '';
    let startDate, endDate;

    switch (period) {
      case 'daily':
        dateFilter = 'DATE(created_at) = CURDATE()';
        startDate = new Date();
        endDate = new Date();
        break;
      case 'weekly':
        dateFilter = 'created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        endDate = new Date();
        break;
      case 'yearly':
        dateFilter = 'YEAR(created_at) = YEAR(NOW())';
        startDate = new Date(new Date().getFullYear(), 0, 1);
        endDate = new Date(new Date().getFullYear(), 11, 31);
        break;
      case 'monthly':
      default:
        dateFilter = 'YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())';
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        break;
    }

    // ë§¤ì¶œ ?µê³„
    const revenueQuery = `
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COALESCE(AVG(total_amount), 0) as average,
        COUNT(*) as count
      FROM reservations
      WHERE store_id = ? AND payment_status = 'paid' AND ${dateFilter}
    `;

    const revenueResult = await query(revenueQuery, [storeId]);
    const revenue = {
      total: Number(revenueResult[0]?.total || 0),
      average: Number(revenueResult[0]?.average || 0),
      growth: 0, // TODO: ?´ì „ ê¸°ê°„ê³?ë¹„êµ?˜ì—¬ ê³„ì‚°
    };

    // ?ˆì•½ ?µê³„
    const reservationQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM reservations
      WHERE store_id = ? AND ${dateFilter}
    `;

    const reservationResult = await query(reservationQuery, [storeId]);
    const total = Number(reservationResult[0]?.total || 0);
    const completed = Number(reservationResult[0]?.completed || 0);
    const cancelled = Number(reservationResult[0]?.cancelled || 0);

    const reservations = {
      total,
      completed,
      cancelled,
      completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
    };

    // ?ìœ ???µê³„ (?‰ê· )
    const occupancyQuery = `
      SELECT
        AVG(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as average
      FROM storages
      WHERE store_id = ?
    `;

    const occupancyResult = await query(occupancyQuery, [storeId]);
    const occupancy = {
      average: Number(occupancyResult[0]?.average || 0).toFixed(2),
      peak: 0.95, // TODO: ?¤ì œ ìµœê³  ?ìœ ??ê³„ì‚°
      peakTime: null, // TODO: ìµœê³  ?ìœ ???œê°„ ê³„ì‚°
    };

    // ê³ ê° ë§Œì¡±???µê³„
    const reviewQuery = `
      SELECT
        COALESCE(AVG(rating), 0) as averageRating,
        COUNT(*) as totalReviews,
        SUM(CASE WHEN response IS NOT NULL THEN 1 ELSE 0 END) as responded
      FROM reviews
      WHERE store_id = ?
    `;

    const reviewResult = await query(reviewQuery, [storeId]);
    const totalReviews = Number(reviewResult[0]?.totalReviews || 0);
    const responded = Number(reviewResult[0]?.responded || 0);

    const customerSatisfaction = {
      averageRating: Number(reviewResult[0]?.averageRating || 0).toFixed(1),
      totalReviews,
      responseRate: totalReviews > 0 ? Number(((responded / totalReviews) * 100).toFixed(1)) : 0,
    };

    return res.json(
      success(
        {
          period,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          revenue,
          reservations,
          occupancy,
          customerSatisfaction,
        },
        '?€?œë³´???µê³„ ì¡°íšŒ ?±ê³µ'
      )
    );
  } catch (err) {
    console.error('?€?œë³´???µê³„ ì¡°íšŒ ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  }
};

/**
 * ?¤ì‹œê°??€?œë³´???°ì´??ì¡°íšŒ
 * GET /api/dashboard/realtime
 */
export const getDashboardRealtime = async (req, res) => {
  try {
    const storeId = req.storeId;

    // ?„ì¬ ?í¬ ?íƒœ
    const statusResult = await query(
      'SELECT status FROM store_status WHERE store_id = ? LIMIT 1',
      [storeId]
    );

    const storeStatus = statusResult[0]?.status || 'closed';

    // ?„ì¬ ?œì„± ?ˆì•½ ??    const activeReservations = await query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE store_id = ? AND (status = 'active' OR status = 'approved')`,
      [storeId]
    );

    // ?€ê¸?ì¤‘ì¸ ?ˆì•½ ??    const pendingReservations = await query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE store_id = ? AND status = 'pending'`,
      [storeId]
    );

    // ?¤ëŠ˜ ë§¤ì¶œ
    const todayRevenue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as revenue
       FROM reservations
       WHERE store_id = ? AND DATE(created_at) = CURDATE() AND payment_status = 'paid'`,
      [storeId]
    );

    // ?„ì¬ ?ìœ  ë³´ê?????    const occupiedStorages = await query(
      `SELECT COUNT(*) as count FROM storages
       WHERE store_id = ? AND status = 'occupied'`,
      [storeId]
    );

    // ?¬ìš© ê°€?¥í•œ ë³´ê?????    const availableStorages = await query(
      `SELECT COUNT(*) as count FROM storages
       WHERE store_id = ? AND status = 'available'`,
      [storeId]
    );

    // ?½ì? ?Šì? ?Œë¦¼ ??    const unreadNotifications = await query(
      `SELECT COUNT(*) as count FROM notifications
       WHERE store_id = ? AND is_read = 0`,
      [storeId]
    );

    return res.json(
      success(
        {
          storeStatus,
          activeReservations: Number(activeReservations[0]?.count || 0),
          pendingReservations: Number(pendingReservations[0]?.count || 0),
          todayRevenue: Number(todayRevenue[0]?.revenue || 0),
          occupiedStorages: Number(occupiedStorages[0]?.count || 0),
          availableStorages: Number(availableStorages[0]?.count || 0),
          unreadNotifications: Number(unreadNotifications[0]?.count || 0),
          lastUpdated: new Date(),
        },
        '?¤ì‹œê°??€?œë³´???°ì´??ì¡°íšŒ ?±ê³µ'
      )
    );
  } catch (err) {
    console.error('?¤ì‹œê°??€?œë³´???°ì´??ì¡°íšŒ ì¤??ëŸ¬:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤', {
        message: err.message,
      })
    );
  }
};
