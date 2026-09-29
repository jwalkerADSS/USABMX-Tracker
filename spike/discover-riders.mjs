// One-time step: log in as the parent account and list the linked minor profiles
// (name, profile id, member id). This is the only step that needs a login.
// Reads USABMX_PARENT_EMAIL / USABMX_PARENT_PASSWORD from the environment.
// Never prints credentials, cookies or tokens.
import { chromium } from 'playwright';

const { USABMX_PARENT_EMAIL: email, USABMX_PARENT_PASSWORD: password } = process.env;
if (!email || !password) { console.error('Set USABMX_PARENT_EMAIL and USABMX_PARENT_PASSWORD'); process.exit(1); }

// In the Claude cloud sandbox, Chromium must trust the egress proxy's CA; set
// CHROMIUM_EXTRA_ARGS there (see README). Elsewhere leave it unset.
const args = process.env.CHROMIUM_EXTRA_ARGS ? process.env.CHROMIUM_EXTRA_ARGS.split(' ') : [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args });
const page = await browser.newPage();
try {
  await page.goto('https://www.usabmx.com/login', { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#email', email);
  await page.click('button[type=submit]');
  await page.waitForSelector('input[type=password]', { timeout: 30000 });
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/me/, { timeout: 60000 });

  const res = await page.request.get('https://www.usabmx.com/api/backend/dashboard/underage-profile');
  const { data = [] } = await res.json();
  const riders = data.map(r => ({
    name: `${r.first_name} ${r.last_name}`,
    username: r.username,
    profileId: r.bmx_profile_id,
    memberId: r.bmx_member_id,
    birthdate: r.birthdate?.slice(0, 10),
  }));
  console.log(JSON.stringify(riders, null, 2));
} finally {
  await browser.close();
}
