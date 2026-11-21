import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://gateway:8000';
// A deployed endpoint (API Gateway is always https) can throttle (429/503) or
// hit a cold start / S3 Files mount timeout, and writes go over NFS.
const deployed = new URL(baseURL).protocol === 'https:';
// bin/e2e --video: record every test, slowed down so that the browser can be
// followed by eye (E2E_SLOW_MO ms per action, 500 unless a valid number).
const video = process.env.E2E_VIDEO === '1';
// Number('') and Number(' ') are 0, so an empty or blank value is not a setting.
const slowMoRaw = (process.env.E2E_SLOW_MO ?? '').trim();
const slowMoSetting = Number(slowMoRaw);
const slowMo = !video
    ? 0
    : slowMoRaw !== '' && Number.isFinite(slowMoSetting) && slowMoSetting >= 0
      ? slowMoSetting
      : 500;

// E2E tests for the memo app running as a Lambda function.
// E2E_BASE_URL selects the target: the local gateway (default, see bin/e2e)
// or a deployed API Gateway endpoint.
export default defineConfig({
    testDir: './tests',
    // The web function has reserved concurrency 1 (and the local RIE handles
    // one invocation at a time), so run everything in a single worker.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: deployed ? 2 : process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: deployed ? 15_000 : 5_000 },
    // Inside the bind-mounted e2e/ so traces of failed tests (and videos) survive
    // the container.
    outputDir: './test-results',
    reporter: process.env.CI ? [['list'], ['github']] : 'list',
    use: {
        baseURL,
        trace: 'retain-on-failure',
        video: video ? { mode: 'on', size: { width: 1280, height: 720 } } : 'off',
        launchOptions: { slowMo },
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
