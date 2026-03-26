import dotenv from 'dotenv';
import { createApp } from './app';
import { SimpleLogger } from './utils/Logger';

dotenv.config();

const logger = new SimpleLogger('Server');

const PORT = process.env.PORT || 3000;

async function start(): Promise<void> {
  try {
    const app = createApp();

    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

start();
