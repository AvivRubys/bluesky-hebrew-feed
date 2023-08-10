import {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';
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

function nodeTypeToLabel(str: string) {
  const snakeCased = str.replaceAll(
    /[A-Z]/g,
    (letter) => '_' + letter.toLowerCase(),
  );

  return snakeCased.substring(1, snakeCased.length - 5);
}

export function createMonitoringPlugin(
  h: Histogram<'operation_type'>,
): KyselyPlugin {
  const queries = new WeakMap<
    PluginTransformQueryArgs['queryId'],
    ReturnType<typeof h.startTimer>
  >();

  return {
    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
      queries.set(
        args.queryId,
        h.startTimer({ operation_type: nodeTypeToLabel(args.node.kind) }),
      );
      return args.node;
    },

    async transformResult(
      args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> {
      const endTimer = queries.get(args.queryId);
      if (endTimer) {
        endTimer();
      }

      return args.result;
    },
  };
}
