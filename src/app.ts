import express, { Express } from 'express';
import 'express-async-errors';
import cors from 'cors';
import passport from 'passport';
import { errorHandler } from './middleware/errorHandler';
import { SimpleLogger } from './utils/Logger';
import routes from './routes';
import { configurePassport } from './config/passport';

const logger = new SimpleLogger('App');

export function createApp(): Express {
  const app = express();
  configurePassport();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(passport.initialize());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use(routes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      statusCode: 404,
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  logger.info('Express app created successfully');

  return app;
}
