import pino from 'pino';

const pinoDevOptions = process.env.NODE_ENV !== 'production' && {
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
};

const logger = pino({ ...pinoDevOptions });

export default logger;
