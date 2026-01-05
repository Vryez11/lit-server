/**
 * Dashboard controllers
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';

/**
 * 매장 대시보드 요약
 * GET /api/dashboard/summary
 */
export const getDashboardSummary = async (req, res) => {
  try {
    const storeId = req.storeId;

    const storeRow = await query('SELECT business_name, created_at, updated_at FROM stores WHERE id = ? LIMIT 1', [
      storeId,
    ]);
    if (!storeRow || storeRow.length === 0) {
      return res.status(404).json(error('STORE_NOT_FOUND', '점포를 찾을 수 없습니다'));
    }

    // 예약 통계
    const reservationStats = await query(
      `SELECT
         COUNT(*) AS totalReservations,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingReservations,
         SUM(CASE WHEN status IN ('active','approved') THEN 1 ELSE 0 END) AS activeReservations,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedReservations,
         SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayReservations
       FROM reservations
       WHERE store_id = ?`,
      [storeId]
    );
    const stats = reservationStats[0] || {};

    // 매출 통계
    const revenueStats = await query(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS totalRevenue,
         COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END), 0) AS todayRevenue
       FROM reservations
       WHERE store_id = ? AND payment_status = 'paid'`,
      [storeId]
    );
    const revenue = revenueStats[0] || {};

    // 보관함 통계
    const storageStats = await query(
      `SELECT
         COUNT(*) AS totalStorages,
         SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS availableStorages,
         SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupiedStorages
       FROM storages
       WHERE store_id = ?`,
      [storeId]
    );
    const storages = storageStats[0] || {};
    const occupancyRate =
      Number(storages.totalStorages || 0) > 0
        ? Number((Number(storages.occupiedStorages || 0) / Number(storages.totalStorages || 0)).toFixed(2))
        : 0;

    const responseData = {
      storeName: storeRow[0].business_name || '',
      totalReservations: Number(stats.totalReservations || 0),
      pendingReservations: Number(stats.pendingReservations || 0),
      activeReservations: Number(stats.activeReservations || 0),
      completedReservations: Number(stats.completedReservations || 0),
      todayReservations: Number(stats.todayReservations || 0),
      totalRevenue: Number(revenue.totalRevenue || 0),
      todayRevenue: Number(revenue.todayRevenue || 0),
      totalStorages: Number(storages.totalStorages || 0),
      availableStorages: Number(storages.availableStorages || 0),
      occupiedStorages: Number(storages.occupiedStorages || 0),
      occupancyRate,
      createdAt: storeRow[0].created_at,
      updatedAt: storeRow[0].updated_at,
    };

    return res.json(success(responseData, '대시보드 요약 조회 성공'));
  } catch (err) {
    console.error('[getDashboardSummary] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 기간별 대시보드 통계
 * GET /api/dashboard/stats?period=daily|weekly|monthly|yearly
 */
export const getDashboardStats = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { period = 'monthly' } = req.query;

    let dateFilter;
    switch (period) {
      case 'daily':
        dateFilter = 'DATE(created_at) = CURDATE()';
        break;
      case 'weekly':
        dateFilter = 'created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case 'yearly':
        dateFilter = 'YEAR(created_at) = YEAR(NOW())';
        break;
      case 'monthly':
      default:
        dateFilter = 'YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())';
        break;
    }

    const revenueResult = await query(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS total,
         COALESCE(AVG(total_amount), 0) AS average,
         COUNT(*) AS count
       FROM reservations
       WHERE store_id = ? AND payment_status = 'paid' AND ${dateFilter}`,
      [storeId]
    );
    const revenue = revenueResult[0] || {};

    const reservationResult = await query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM reservations
       WHERE store_id = ? AND ${dateFilter}`,
      [storeId]
    );
    const r = reservationResult[0] || {};
    const total = Number(r.total || 0);
    const completed = Number(r.completed || 0);
    const cancelled = Number(r.cancelled || 0);

    const occupancyResult = await query(
      `SELECT
         AVG(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS average
       FROM storages
       WHERE store_id = ?`,
      [storeId]
    );
    const occupancy = {
      average: Number(occupancyResult[0]?.average || 0).toFixed(2),
      peak: 0,
      peakTime: null,
    };

    const reviewResult = await query(
      `SELECT
         COALESCE(AVG(rating), 0) AS averageRating,
         COUNT(*) AS totalReviews,
         SUM(CASE WHEN response IS NOT NULL THEN 1 ELSE 0 END) AS responded
       FROM reviews
       WHERE store_id = ?`,
      [storeId]
    );
    const rev = reviewResult[0] || {};
    const totalReviews = Number(rev.totalReviews || 0);
    const responded = Number(rev.responded || 0);
    const customerSatisfaction = {
      averageRating: Number(rev.averageRating || 0).toFixed(1),
      totalReviews,
      responseRate: totalReviews > 0 ? Number(((responded / totalReviews) * 100).toFixed(1)) : 0,
    };

    return res.json(
      success(
        {
          period,
          revenue: {
            total: Number(revenue.total || 0),
            average: Number(revenue.average || 0),
            count: Number(revenue.count || 0),
            growth: 0,
          },
          reservations: {
            total,
            completed,
            cancelled,
            completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
          },
          occupancy,
          customerSatisfaction,
        },
        '대시보드 통계 조회 성공'
      )
    );
  } catch (err) {
    console.error('[getDashboardStats] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};

/**
 * 실시간 대시보드
 * GET /api/dashboard/realtime
 */
export const getDashboardRealtime = async (req, res) => {
  try {
    const storeId = req.storeId;

    const statusResult = await query('SELECT status FROM store_status WHERE store_id = ? LIMIT 1', [storeId]);
    const storeStatus = statusResult[0]?.status || 'closed';

    const activeReservations = await query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE store_id = ? AND (status = 'active' OR status = 'approved')`,
      [storeId]
    );
    const pendingReservations = await query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE store_id = ? AND status = 'pending'`,
      [storeId]
    );
    const todayRevenue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as revenue
       FROM reservations
       WHERE store_id = ? AND DATE(created_at) = CURDATE() AND payment_status = 'paid'`,
      [storeId]
    );
    const occupiedStorages = await query(
      `SELECT COUNT(*) as count FROM storages
       WHERE store_id = ? AND status = 'occupied'`,
      [storeId]
    );
    const availableStorages = await query(
      `SELECT COUNT(*) as count FROM storages
       WHERE store_id = ? AND status = 'available'`,
      [storeId]
    );
    const unreadNotifications = await query(
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
        '실시간 대시보드 조회 성공'
      )
    );
  } catch (err) {
    console.error('[getDashboardRealtime] error:', err);
    return res.status(500).json(error('INTERNAL_ERROR', '서버 오류가 발생했습니다', { message: err.message }));
  }
};
