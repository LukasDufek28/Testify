import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Exercise the same core journeys in every engine, including touch input.
// Keep the full visual and responsive regression suite in the primary config.
const core = /registration opens|expired API|assistant greets|assistant keeps|assistant grows|formats readable|global chat|assistant explains|assistant selects data sources|untouched batch|short saved runs|selection uses|retry resumes|Stop ends|stopping during|long messages|creating an AI draft|commission and percentage|retired replay URL|saved defaults persist|saved display timezone|single run setup|library cards reflow|workspace backup|batch preserves|strategy library imports|CSV data import|manual editing validates|editor opens the single|mobile editor|Improve uses|saved results show|trade selection and filters|history filters and comparison|background.*viewport|short monthly|equity axis distinguishes|programmed trade|older selected|small asset|workspace search|searchable dark|keyboard selection|equity reveals|late loaded/;
const touchCore = /registration opens|expired API|assistant greets|assistant keeps|assistant grows|formats readable|global chat|assistant explains|assistant selects data sources|untouched batch|short saved runs|selection uses|retry resumes|Stop ends|stopping during|long messages|creating an AI draft|commission and percentage|retired replay URL|saved defaults persist|saved display timezone|single run setup|library cards reflow|workspace backup|batch preserves|strategy library imports|CSV data import|editor opens the single|mobile editor|saved results show|trade selection and filters|history filters and comparison|background.*viewport|short monthly|equity axis distinguishes|programmed trade|older selected|small asset|workspace search|searchable dark|keyboard selection|equity reveals|late loaded/;
export default defineConfig({
  ...base,
  timeout: 60000,
  expect: {timeout:15000},
  outputDir: 'test-results-cross',
  reporter: [['list'], ['html', {outputFolder:'playwright-report-cross',open:'never'}]],
  testMatch: /(?:auth-integration|assistant|run-modes|workspace|studio|results|responsive-shell|controls|strategy-library|ui-polish|fresh-workspace)\.spec\.ts/,
  grep: new RegExp(`fresh accounts|sidebar highlights|data and overview|selected strategy checkmark|workspace read failures|preview guest identity|${core.source}`),
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', grep: new RegExp(`fresh accounts|data and overview|selected strategy checkmark|workspace read failures|${touchCore.source}`), use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', grep: new RegExp(`fresh accounts|data and overview|selected strategy checkmark|workspace read failures|${touchCore.source}`), use: { ...devices['iPhone 13'] } },
  ],
});
