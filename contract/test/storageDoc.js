import { eventLoopIteration } from '@agoric/internal/src/testing-utils.js';

/**
 * @param {import('ava').ExecutionContext<unknown>} t
 * @param {import('@agoric/internal/src/storage-test-utils.js').MockChainStorageRoot} storage
 * @param {({ note: string } | { node: string, owner: string }) &
 *  ({ pattern: string, replacement: string } | {}) &
 *  ({ marshaller?: Marshaller })
 * } opts
 */
export const documentStorageSchema = async (t, storage, opts) => {
  // chainStorage publication is unsynchronized
  await eventLoopIteration();

  const { pattern, replacement } =
    'pattern' in opts
      ? opts
      : { pattern: 'mockChainStorageRoot.', replacement: 'published.' };
  const illustration = [...storage.keys()].sort().map(
    /** @type {(k: string) => [string, unknown]} */
    key => [
      key.replace(pattern, replacement),
      storage.getBody(key, opts.marshaller),
    ],
  );
  const pruned = illustration.filter(
    'node' in opts
      ? ([key, _]) => key.startsWith(`published.${opts.node}`)
      : _entry => true,
  );

  const note =
    'note' in opts
      ? opts.note
      : `Under "published", the "${opts.node}" node is delegated to ${opts.owner}.`;
  const boilerplate = `
The example below illustrates the schema of the data published there.

See also board marshalling conventions (_to appear_).`;
  t.snapshot(pruned, note + boilerplate);
};
