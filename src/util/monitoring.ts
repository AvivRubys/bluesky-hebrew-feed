import { Histogram } from 'prom-client';

export const measure = async <T>(
  h: Histogram<'status'> | Histogram.Internal<'status'>,
  fn: () => Promise<T>,
): Promise<T> => {
  const end = h.startTimer();

  try {
    const res = await fn();
    end({ status: 'success' });
    return res;
  } catch (err) {
    end({ status: 'failure' });
    throw err;
  }
};
