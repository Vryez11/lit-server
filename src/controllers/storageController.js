/**
 * 보관함 관리 컨트롤러
 * Phase 3 - 보관함 CRUD APIs
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 보관함 목록 조회
 * GET /api/storages
 */
export const getStorages = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      status: statusFilter,
      type: typeFilter,
      page = 1,
      limit = 20,
    } = req.query;

    // 필터 조건 구성
    const conditions = ['store_id = ?'];
    const params = [storeId];

    if (statusFilter) {
      conditions.push('status = ?');
      params.push(statusFilter);
    }

    if (typeFilter) {
      conditions.push('type = ?');
      params.push(typeFilter);
    }

    const whereClause = conditions.join(' AND ');

    // 전체 개수 조회
    const countResult = await query(
      `SELECT COUNT(*) as total FROM storages WHERE ${whereClause}`,
      params
    );
    const totalItems = countResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    // 페이지네이션 계산
    const offset = (page - 1) * limit;

    // 보관함 목록 조회
    const storages = await query(
      `SELECT
        s.id, s.store_id as storeId, s.number, s.type, s.status,
        s.width, s.height, s.depth, s.pricing,
        s.floor, s.section, s.row_num as rowNum, s.column_num as columnNum,
        s.created_at as createdAt, s.updated_at as updatedAt,
        r.id as currentReservationId, r.customer_name as customerName,
        r.start_time as startTime, r.end_time as endTime
      FROM storages s
      LEFT JOIN reservations r ON s.id = r.storage_id
        AND (r.status = 'active' OR r.status = 'confirmed' OR r.status = 'in_progress')
      WHERE ${whereClause}
      ORDER BY s.number
      LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    // 응답 데이터 구성
    const formattedStorages = storages.map(storage => {
      const result = {
        id: storage.id,
        storeId: storage.storeId,
        number: storage.number,
        type: storage.type,
        status: storage.status,
        size: {
          width: storage.width,
          height: storage.height,
          depth: storage.depth,
        },
        pricing: storage.pricing,
        location: {
          floor: storage.floor,
          section: storage.section,
          row: storage.rowNum,
          column: storage.columnNum,
        },
        createdAt: storage.createdAt,
        updatedAt: storage.updatedAt,
      };

      if (storage.currentReservationId) {
        result.currentReservation = {
          id: storage.currentReservationId,
          customerName: storage.customerName,
          startTime: storage.startTime,
          endTime: storage.endTime,
        };
      }

      return result;
    });

    return res.json(
      success(
        {
          storages: formattedStorages,
          pagination: {
            currentPage: Number(page),
            totalPages,
            totalItems,
            itemsPerPage: Number(limit),
          },
        },
        '보관함 목록 조회 성공'
      )
    );
  } catch (err) {
    console.error('보관함 목록 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 보관함 단일 조회
 * GET /api/storages/:id
 */
export const getStorage = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;

    const storages = await query(
      `SELECT
        s.id, s.store_id as storeId, s.number, s.type, s.status,
        s.width, s.height, s.depth, s.pricing,
        s.floor, s.section, s.row_num as rowNum, s.column_num as columnNum,
        s.created_at as createdAt, s.updated_at as updatedAt,
        r.id as currentReservationId, r.customer_name as customerName,
        r.customer_phone as customerPhone, r.start_time as startTime,
        r.end_time as endTime, r.status as reservationStatus
      FROM storages s
      LEFT JOIN reservations r ON s.id = r.storage_id
        AND (r.status = 'active' OR r.status = 'confirmed' OR r.status = 'in_progress')
      WHERE s.id = ? AND s.store_id = ?
      LIMIT 1`,
      [id, storeId]
    );

    if (!storages || storages.length === 0) {
      return res.status(404).json(
        error('STORAGE_NOT_FOUND', '보관함을 찾을 수 없습니다')
      );
    }

    const storage = storages[0];
    const result = {
      id: storage.id,
      storeId: storage.storeId,
      number: storage.number,
      type: storage.type,
      status: storage.status,
      size: {
        width: storage.width,
        height: storage.height,
        depth: storage.depth,
      },
      pricing: storage.pricing,
      location: {
        floor: storage.floor,
        section: storage.section,
        row: storage.rowNum,
        column: storage.columnNum,
      },
      createdAt: storage.createdAt,
      updatedAt: storage.updatedAt,
    };

    if (storage.currentReservationId) {
      result.currentReservation = {
        id: storage.currentReservationId,
        customerName: storage.customerName,
        customerPhone: storage.customerPhone,
        startTime: storage.startTime,
        endTime: storage.endTime,
        status: storage.reservationStatus,
      };
    }

    return res.json(success(result, '보관함 조회 성공'));
  } catch (err) {
    console.error('보관함 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 보관함 생성
 * POST /api/storages
 */
export const createStorage = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      number,
      type,
      width,
      height,
      depth,
      pricing,
      floor,
      section,
      row,
      column,
    } = req.body;

    // 필수 필드 검증
    if (!number || !type || !pricing) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '필수 필드가 누락되었습니다', {
          required: ['number', 'type', 'pricing'],
        })
      );
    }

    // 보관함 번호 중복 확인
    const existingStorages = await query(
      'SELECT id FROM storages WHERE store_id = ? AND number = ? LIMIT 1',
      [storeId, number]
    );

    if (existingStorages && existingStorages.length > 0) {
      return res.status(400).json(
        error('DUPLICATE_STORAGE_NUMBER', '이미 존재하는 보관함 번호입니다', {
          number,
        })
      );
    }

    // 보관함 생성
    const storageId = `storage_${storeId}_${uuidv4()}`;

    await query(
      `INSERT INTO storages (
        id, store_id, number, type, status, width, height, depth, pricing,
        floor, section, row_num, column_num, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        storageId,
        storeId,
        number,
        type,
        width || null,
        height || null,
        depth || null,
        pricing,
        floor || null,
        section || null,
        row || null,
        column || null,
      ]
    );

    // 생성된 보관함 조회
    const storages = await query(
      `SELECT
        id, store_id as storeId, number, type, status,
        width, height, depth, pricing,
        floor, section, row_num as rowNum, column_num as columnNum,
        created_at as createdAt, updated_at as updatedAt
      FROM storages
      WHERE id = ?
      LIMIT 1`,
      [storageId]
    );

    const storage = storages[0];
    const result = {
      id: storage.id,
      storeId: storage.storeId,
      number: storage.number,
      type: storage.type,
      status: storage.status,
      size: {
        width: storage.width,
        height: storage.height,
        depth: storage.depth,
      },
      pricing: storage.pricing,
      location: {
        floor: storage.floor,
        section: storage.section,
        row: storage.rowNum,
        column: storage.columnNum,
      },
      createdAt: storage.createdAt,
      updatedAt: storage.updatedAt,
    };

    return res.status(201).json(success(result, '보관함 생성 성공'));
  } catch (err) {
    console.error('보관함 생성 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 보관함 수정
 * PUT /api/storages/:id
 */
export const updateStorage = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const {
      number,
      type,
      status,
      width,
      height,
      depth,
      pricing,
      floor,
      section,
      row,
      column,
    } = req.body;

    // 보관함 존재 확인
    const existingStorages = await query(
      'SELECT id FROM storages WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );

    if (!existingStorages || existingStorages.length === 0) {
      return res.status(404).json(
        error('STORAGE_NOT_FOUND', '보관함을 찾을 수 없습니다')
      );
    }

    // 보관함 번호 중복 확인 (자신 제외)
    if (number) {
      const duplicates = await query(
        'SELECT id FROM storages WHERE store_id = ? AND number = ? AND id != ? LIMIT 1',
        [storeId, number, id]
      );

      if (duplicates && duplicates.length > 0) {
        return res.status(400).json(
          error('DUPLICATE_STORAGE_NUMBER', '이미 존재하는 보관함 번호입니다', {
            number,
          })
        );
      }
    }

    // 수정할 필드만 동적으로 업데이트
    const updates = [];
    const values = [];

    if (number !== undefined) {
      updates.push('number = ?');
      values.push(number);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      values.push(type);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (width !== undefined) {
      updates.push('width = ?');
      values.push(width);
    }
    if (height !== undefined) {
      updates.push('height = ?');
      values.push(height);
    }
    if (depth !== undefined) {
      updates.push('depth = ?');
      values.push(depth);
    }
    if (pricing !== undefined) {
      updates.push('pricing = ?');
      values.push(pricing);
    }
    if (floor !== undefined) {
      updates.push('floor = ?');
      values.push(floor);
    }
    if (section !== undefined) {
      updates.push('section = ?');
      values.push(section);
    }
    if (row !== undefined) {
      updates.push('row_num = ?');
      values.push(row);
    }
    if (column !== undefined) {
      updates.push('column_num = ?');
      values.push(column);
    }

    if (updates.length === 0) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '수정할 정보가 없습니다')
      );
    }

    // updated_at 추가
    updates.push('updated_at = NOW()');
    values.push(id, storeId);

    // 업데이트 실행
    await query(
      `UPDATE storages SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`,
      values
    );

    // 업데이트된 보관함 조회
    const storages = await query(
      `SELECT
        id, store_id as storeId, number, type, status,
        width, height, depth, pricing,
        floor, section, row_num as rowNum, column_num as columnNum,
        created_at as createdAt, updated_at as updatedAt
      FROM storages
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    const storage = storages[0];
    const result = {
      id: storage.id,
      storeId: storage.storeId,
      number: storage.number,
      type: storage.type,
      status: storage.status,
      size: {
        width: storage.width,
        height: storage.height,
        depth: storage.depth,
      },
      pricing: storage.pricing,
      location: {
        floor: storage.floor,
        section: storage.section,
        row: storage.rowNum,
        column: storage.columnNum,
      },
      createdAt: storage.createdAt,
      updatedAt: storage.updatedAt,
    };

    return res.json(success(result, '보관함 수정 성공'));
  } catch (err) {
    console.error('보관함 수정 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 보관함 삭제
 * DELETE /api/storages/:id
 */
export const deleteStorage = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;

    // 보관함 존재 확인
    const existingStorages = await query(
      'SELECT status FROM storages WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );

    if (!existingStorages || existingStorages.length === 0) {
      return res.status(404).json(
        error('STORAGE_NOT_FOUND', '보관함을 찾을 수 없습니다')
      );
    }

    // 사용 중인 보관함 삭제 방지
    if (existingStorages[0].status === 'occupied') {
      return res.status(400).json(
        error('STORAGE_IN_USE', '사용 중인 보관함은 삭제할 수 없습니다')
      );
    }

    // 보관함 삭제
    await query('DELETE FROM storages WHERE id = ? AND store_id = ?', [id, storeId]);

    return res.json(
      success(
        {
          id,
          deleted: true,
        },
        '보관함 삭제 성공'
      )
    );
  } catch (err) {
    console.error('보관함 삭제 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};
