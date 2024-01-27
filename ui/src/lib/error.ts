export const assert = Object.assign(
  (condition: unknown, message: string): asserts condition => {
    if (!condition) {
      throw new Error(message);
    }
  },
  {
    typeof: (x: unknown, expected: string) => {
      if (typeof x !== expected) {
        throw new Error(`Expected ${expected} but got ${typeof x}`);
      }
    },
  }
);
