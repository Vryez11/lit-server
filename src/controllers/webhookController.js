/**
 * ?¹í›… ì»¨íŠ¸ë¡¤ëŸ¬
 * ? ìŠ¤?˜ì´ë¨¼ì¸  ?¹í›… ?„ìš©
 */

import { processWebhook } from '../services/webhookService.js';

/**
 * ? ìŠ¤?˜ì´ë¨¼ì¸  ?¹í›… ì²˜ë¦¬
 * POST /api/webhooks/toss
 */
export const handleTossWebhook = async (req, res) => {
  try {
    const webhookData = req.body;


    // ?¹í›… ì²˜ë¦¬
    const result = await processWebhook(webhookData);

    // ?¹í›…?€ ??ƒ 200 OK ë°˜í™˜ (PG???¬ì‹œ??ë°©ì?)
    return res.status(200).json(result);

  } catch (err) {
    console.error('???¹í›… ì²˜ë¦¬ ?¤íŒ¨:', err);

    // ?¹í›…?€ ?¤íŒ¨?´ë„ 200 ë°˜í™˜ (ë¬´í•œ ?¬ì‹œ??ë°©ì?)
    // ?? ë¡œê·¸??ë°˜ë“œ???¨ê²¨???˜ë™ ì²˜ë¦¬ ê°€?¥í•˜ê²?
    return res.status(200).json({
      success: false,
      message: 'Webhook processing failed',
      error: err.message,
    });
  }
};
