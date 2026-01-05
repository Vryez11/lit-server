/**
 * MySQL ?°ì´?°ë² ?´ìŠ¤ ?°ê²° ?¤ì •
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// ?°ì´?°ë² ?´ìŠ¤ ?°ê²° ?€ ?ì„±
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'suittrip',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  timezone: '+09:00', // ?œêµ­ ?œê°„?€
});

/**
 * ?°ê²° ?€?ì„œ ?°ê²° ê°€?¸ì˜¤ê¸?
 * @returns {Promise<PoolConnection>}
 */
export const getConnection = async () => {
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.error('?°ì´?°ë² ?´ìŠ¤ ?°ê²° ?¤íŒ¨:', error);
    throw error;
  }
};

/**
 * ì¿¼ë¦¬ ?¤í–‰
 * @param {string} sql - SQL ì¿¼ë¦¬
 * @param {Array} params - ì¿¼ë¦¬ ?Œë¼ë¯¸í„°
 * @returns {Promise<Array>}
 */
export const query = async (sql, params = []) => {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('ì¿¼ë¦¬ ?¤í–‰ ?¤íŒ¨:', error);
    throw error;
  }
};

/**
 * ?¸ëœ??…˜ ?œì‘
 * @param {Function} callback - ?¸ëœ??…˜ ?´ì—???¤í–‰??ì½œë°±
 * @returns {Promise<any>}
 */
export const transaction = async (callback) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * ?°ê²° ?€ ì¢…ë£Œ
 * @returns {Promise<void>}
 */
let isPoolClosed = false;

export const closePool = async () => {
  if (isPoolClosed) {
    return;
  }

  try {
    isPoolClosed = true;
    await pool.end();
  } catch (error) {
    // ?´ë? ?«íŒ ê²½ìš° ?ëŸ¬ë¥?ë¬´ì‹œ
    if (error.message && error.message.includes('closed state')) {
      return;
    }
    console.error('???°ê²° ?€ ì¢…ë£Œ ?¤íŒ¨:', error.message);
  }
};

/**
 * ?°ì´?°ë² ?´ìŠ¤ ?°ê²° ?ŒìŠ¤??
 * @returns {Promise<boolean>}
 */
export const testConnection = async () => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.query('SELECT 1');
    connection.release();
    return true;
  } catch (error) {
    console.error('???°ì´?°ë² ?´ìŠ¤ ?°ê²° ?¤íŒ¨:', error.message);
    return false;
  }
};

// NOTE: ?„ë¡œ?¸ìŠ¤ ì¢…ë£Œ ???°ê²° ?€ ?•ë¦¬??server.js?ì„œ ì²˜ë¦¬?©ë‹ˆ??
// ?¬ê¸°??ì²˜ë¦¬?˜ë©´ ì¤‘ë³µ ?¸ì¶œë¡??¸í•œ ?ëŸ¬ê°€ ë°œìƒ?????ˆìŠµ?ˆë‹¤.

export default pool;
