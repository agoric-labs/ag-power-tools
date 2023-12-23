#! /usr/bin/env node
// @ts-check
/* global process */
import '@endo/init';
import { createRequire } from 'module';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';

const myRequire = createRequire(import.meta.url);
const resolve = (rel, abs) => fileURLToPath(new URL(rel, abs).toString());
const root = new URL('..', import.meta.url).toString();

const assets = {
  package: myRequire.resolve('../package.json'),
  startPostalSvc: myRequire.resolve('../src/start-postalSvc.js'),
};

const main = async () => {
  const read = async location => readFile(fileURLToPath(location));
  const write = async (target, content) => {
    const location = resolve(target, root);
    await writeFile(location, content);
  };

  const packageInfo = await readFile(assets.package, 'utf8').then(s =>
    JSON.parse(s),
  );
  const { version } = packageInfo;

  const bundle = await makeBundle(
    read,
    pathToFileURL(assets.startPostalSvc).toString(),
  );
  const name = 'startPostalSvc';
  const versionedBundle = `// ${name}@${version}\n${bundle}`;

  console.log(`Bundle size: ${versionedBundle.length} bytes`);

  await mkdir('dist', { recursive: true });

  const bundleFilePaths = ['dist/${name}.umd.js'];

  await Promise.all([
    ...bundleFilePaths.map(dest => write(dest, versionedBundle)),
  ]);
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
