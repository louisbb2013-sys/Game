// Shared Playwright launcher (uses the preinstalled Chromium with SwiftShader WebGL).
import { chromium } from 'playwright';
import fs from 'node:fs';

const candidates = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);

export async function launch() {
  const executablePath = candidates.find((p) => fs.existsSync(p));
  return chromium.launch({
    executablePath,
    // NOGL=1 simulates a browser without WebGL (fallback testing).
    args: process.env.NOGL
      ? ['--disable-webgl', '--disable-3d-apis']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}
