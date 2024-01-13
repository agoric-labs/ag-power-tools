// @ts-check
const { entries, fromEntries } = Object;

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
export const allValues = async obj => {
  const es = await Promise.all(
    entries(obj).map(async ([k, v]) => [k, await v]),
  );
  return fromEntries(es);
};

/** @type { <V, U, T extends Record<string, V>>(obj: T, f: (v: V) => U) => { [K in keyof T]: U }} */
export const mapValues = (obj, f) =>
  fromEntries(
    entries(obj).map(([p, v]) => {
      const entry = [p, f(v)];
      return entry;
    }),
  );
