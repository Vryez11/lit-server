/**
 * ?˜ëœ¨ë¦?Suittrip) ë°±ì—”???œë²„
 * ?œë²„ ì§„ìž…?? */

import app from './src/app.js';
import { closePool } from './src/config/database.js';
import dotenv from 'dotenv';

dotenv.config();

// ?¬íŠ¸ ?¤ì •
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ?œë²„ ?œìž‘
const server = app.listen(PORT, () => {
});

// Graceful Shutdown ì²˜ë¦¬
const gracefulShutdown = async (signal) => {

  // ?œë²„ ì¢…ë£Œ
  server.close(async () => {

    try {
      // ?°ì´?°ë² ?´ìŠ¤ ?°ê²° ì¢…ë£Œ
      await closePool();

      process.exit(0);
    } catch (error) {
      console.error('??ì¢…ë£Œ ì¤??¤ë¥˜ ë°œìƒ:', error);
      process.exit(1);
    }
  });

  // 30ì´???ê°•ì œ ì¢…ë£Œ
  setTimeout(() => {
    console.error('??ê°•ì œ ì¢…ë£Œ: ?•ìƒ ì¢…ë£Œ ?œê°„ ì´ˆê³¼');
    process.exit(1);
  }, 30000);
};

// ?œê·¸???¸ë“¤???±ë¡
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ì²˜ë¦¬?˜ì? ?Šì? Promise ?ëŸ¬ ì²˜ë¦¬
process.on('unhandledRejection', (reason, promise) => {
  console.error('ì²˜ë¦¬?˜ì? ?Šì? Promise ê±°ë?:', reason);
  console.error('Promise:', promise);
});

// ì²˜ë¦¬?˜ì? ?Šì? ?ˆì™¸ ì²˜ë¦¬
process.on('uncaughtException', (error) => {
  console.error('ì²˜ë¦¬?˜ì? ?Šì? ?ˆì™¸:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

export default server;
