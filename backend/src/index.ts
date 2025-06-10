import App from './app';
import logger from './utils/logger';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle SIGTERM gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  if (application) {
    await application.stop();
  }
  process.exit(0);
});

// Handle SIGINT gracefully (Ctrl+C)
process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  if (application) {
    await application.stop();
  }
  process.exit(0);
});

// Create and start the application
const application = new App();

async function main() {
  try {
    await application.start();
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
main();
