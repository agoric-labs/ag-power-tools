// @ts-check
import {
  coreEvalGlobals,
  moduleToScript,
  configureBundleID,
} from './tools/rollup-plugin-core-eval.js';

/** @type {import('rollup').RollupOptions} */
const config = {
  output: {
    globals: coreEvalGlobals,
    file: 'bundles/deploy-starter.js',
    format: 'es',
    footer: 'main',
  },
  external: ['@endo/far'],
  plugins: [
    configureBundleID({
      name: 'contractStarter',
      rootModule: './src/contractStarter.js',
      cache: 'bundles',
    }),
    moduleToScript(),
  ],
};
export default config;
