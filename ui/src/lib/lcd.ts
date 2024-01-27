import { assert } from './error.js';
const { freeze } = Object;

export const makeLCD = (
  apiURL: string,
  { fetch }: { fetch: typeof window.fetch }
) => {
  assert.typeof(apiURL, 'string');

  const getJSON = (
    href: string,
    options: { headers?: Record<string, string> } = {}
  ) => {
    const opts = {
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };
    const url = `${apiURL}${href}`;
    return fetch(url, opts).then(r => {
      if (!r.ok) throw Error(r.statusText);
      return r.json().then(data => {
        return data;
      });
    });
  };

  return freeze({
    getJSON,
    latestBlock: () => getJSON(`/cosmos/base/tendermint/v1beta1/blocks/latest`),
  });
};

export type LCD = ReturnType<typeof makeLCD>;
