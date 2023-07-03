import { AsyncIterableX, interval, concat, of, merge } from 'ix/asynciterable';
import { map, wrapWithAbort } from 'ix/asynciterable/operators';

const timerEvent = {};
const ended = {};

class BufferTime<TSource> extends AsyncIterableX<TSource[]> {
  constructor(
    private readonly source: AsyncIterable<TSource>,
    private readonly maxWaitTime: number,
  ) {
    super();
  }

  async *[Symbol.asyncIterator](signal?: AbortSignal) {
    const buffer: TSource[] = [];
    const timer = interval(this.maxWaitTime).pipe(map(() => timerEvent));
    const source = concat(this.source, of(ended));
    const merged = merge(source, timer);

    for await (const item of wrapWithAbort(merged, signal)) {
      if (item === ended) {
        break;
      }
      if (item !== timerEvent) {
        buffer.push(item as TSource);
      }
      if (buffer.length && item === timerEvent) {
        yield buffer.slice();
        buffer.length = 0;
      }
    }

    if (buffer.length) {
      yield buffer;
    }
  }
}

export function bufferTime<TSource>(time: number) {
  return function bufferOperatorFunction(
    source: AsyncIterable<TSource>,
  ): AsyncIterableX<TSource[]> {
    return new BufferTime<TSource>(source, time);
  };
}
