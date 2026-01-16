import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const CHROME_BIN = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), '.chrome-e2e');

function nowIso() {
  return new Date().toISOString();
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function writeJson(filename, data) {
  await fs.writeFile(path.join(OUT_DIR, filename), JSON.stringify(data, null, 2));
}

async function screenshot(page, name) {
  const p = path.join(OUT_DIR, name);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.body && document.body.innerText && document.body.innerText.includes(t),
    { timeout },
    text
  );
}

async function getText(page, selector) {
  return await page.$eval(selector, (el) => el.textContent || '');
}

async function setLocalStorage(page, entries) {
  await page.evaluate((kv) => {
    for (const [k, v] of Object.entries(kv)) {
      localStorage.setItem(k, v);
    }
  }, entries);
}

async function run() {
  await ensureOutDir();

  const report = {
    startedAt: nowIso(),
    baseUrl: BASE_URL,
    chromeBin: CHROME_BIN,
    steps: [],
    screenshots: [],
    console: [],
    success: false,
  };

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_BIN,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--window-size=1365,768',
      '--use-fake-ui-for-media-stream', // avoids permission prompt if any page requests it
      '--use-fake-device-for-media-stream', // ensures a dummy mic device exists in headless
      '--autoplay-policy=no-user-gesture-required',
    ],
    defaultViewport: { width: 1365, height: 768 },
  });

  try {
    const ctx = await browser.createBrowserContext();

    // --- HOST: create room
    const host = await ctx.newPage();
    host.on('console', (msg) => {
      report.console.push({ page: 'host', type: msg.type(), text: msg.text() });
    });
    host.on('response', (resp) => {
      try {
        if (resp.status && resp.status() === 404) {
          report.console.push({ page: 'host', type: 'http404', text: resp.url() });
        }
      } catch {}
    });

    report.steps.push({ at: nowIso(), step: 'open_host', url: `${BASE_URL}/host` });
    await host.goto(`${BASE_URL}/host`, { waitUntil: 'domcontentloaded' });

    // Ensure name exists so viewer/mic can label properly
    await setLocalStorage(host, { roombrief_name: 'ChromeHost' });
    await host.reload({ waitUntil: 'domcontentloaded' });

    // Wait for room creation UI
    await host.waitForSelector('#hostRoomCode', { timeout: 15000 });

    // Room code should become non-placeholder
    await host.waitForFunction(() => {
      const el = document.getElementById('hostRoomCode');
      if (!el) return false;
      const t = (el.textContent || '').trim();
      return t && t !== '-----';
    }, { timeout: 15000 });

    const roomCode = (await getText(host, '#hostRoomCode')).trim();
    report.steps.push({ at: nowIso(), step: 'room_created', roomCode });
    report.screenshots.push(await screenshot(host, '01-host-room-created.png'));

    // Click Open Room (should navigate to /viewer?room=XXXXXX)
    await host.waitForSelector('#hostOpenRoomBtn', { timeout: 10000 });
    report.steps.push({ at: nowIso(), step: 'open_room_click' });
    await Promise.all([
      host.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      host.click('#hostOpenRoomBtn'),
    ]);

    const viewerUrl = host.url();
    report.steps.push({ at: nowIso(), step: 'viewer_opened', url: viewerUrl });
    report.screenshots.push(await screenshot(host, '02-viewer-opened.png'));

    // Wait until viewer has a room code (ensures currentRoom is set client-side)
    await host.waitForFunction(() => {
      const el = document.getElementById('viewerRoomCode');
      const t = (el?.textContent || '').trim();
      return t && t.length === 6;
    }, { timeout: 15000 });

    // Viewer mic button should exist and be clickable (enable -> status changes)
    // Do this BEFORE opening any modal overlays that might block clicks.
    await host.waitForSelector('#viewerMicBtn', { timeout: 15000 });
    const initialMicBtnText = (await getText(host, '#viewerMicBtn')).trim();
    report.steps.push({ at: nowIso(), step: 'viewer_mic_button_present', text: initialMicBtnText });

    // Click to enable mic (fake device + fake UI should allow this in headless)
    report.steps.push({ at: nowIso(), step: 'viewer_mic_button_click_enable' });
    await host.click('#viewerMicBtn');
    await host.waitForFunction(() => {
      const btn = document.getElementById('viewerMicBtn');
      if (!btn) return false;
      const t = (btn.textContent || '').trim();
      return t && t !== 'Enable mic';
    }, { timeout: 15000 });
    const afterEnableMicBtnText = (await getText(host, '#viewerMicBtn')).trim();
    report.steps.push({ at: nowIso(), step: 'viewer_mic_button_enabled', text: afterEnableMicBtnText });
    report.screenshots.push(await screenshot(host, '02c-viewer-mic-enabled.png'));

    // Invite modal should populate links + QR
    await host.waitForSelector('#btnInvite', { timeout: 15000 });
    await host.click('#btnInvite');
    await host.waitForSelector('#viewerInviteLink', { timeout: 15000 });
    await host.waitForFunction(() => {
      const el = document.getElementById('viewerInviteLink');
      const v = (el && 'value' in el) ? (el.value || '') : '';
      return v.includes('/viewer') && v.includes('room=');
    }, { timeout: 15000 });
    const viewerInvite = await host.$eval('#viewerInviteLink', (el) => el.value || '');
    const micInvite = await host.$eval('#micInviteLink', (el) => el.value || '');
    const qrSrc = await host.$eval('#viewerQrImg', (el) => el.getAttribute('src') || '');
    if (!viewerInvite.includes(`/viewer`) || !viewerInvite.includes(`room=${roomCode}`)) {
      throw new Error(`Invite viewer link not populated correctly: ${viewerInvite}`);
    }
    if (!micInvite.includes(`/mic`) || !micInvite.includes(`room=${roomCode}`)) {
      throw new Error(`Invite mic link not populated correctly: ${micInvite}`);
    }
    if (!qrSrc.includes(`/api/room/${roomCode}/invite-qr.png`)) {
      throw new Error(`Invite QR src not populated correctly: ${qrSrc}`);
    }
    report.steps.push({ at: nowIso(), step: 'invite_modal_populates', viewerInvite, micInvite, qrSrc });
    report.screenshots.push(await screenshot(host, '02a-invite-modal.png'));
    // Close invite modal so it doesn't block clicks
    await host.click('#inviteClose');
    await host.waitForFunction(() => {
      const m = document.getElementById('inviteModal');
      return !m || m.classList.contains('hidden');
    }, { timeout: 15000 });

    // --- ASSERT: QR endpoint returns PNG for both viewer + mic roles
    {
      const qrCheck = await ctx.newPage();
      qrCheck.on('console', (msg) => {
        report.console.push({ page: 'qrCheck', type: msg.type(), text: msg.text() });
      });
      qrCheck.on('response', (resp) => {
        try {
          if (resp.status && resp.status() === 404) {
            report.console.push({ page: 'qrCheck', type: 'http404', text: resp.url() });
          }
        } catch {}
      });

      const viewerQrUrl = `${BASE_URL}/api/room/${roomCode}/invite-qr.png?role=viewer`;
      const micQrUrl = `${BASE_URL}/api/room/${roomCode}/invite-qr.png?role=mic`;

      report.steps.push({ at: nowIso(), step: 'qr_fetch_viewer', url: viewerQrUrl });
      const viewerResp = await qrCheck.goto(viewerQrUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const viewerCt = viewerResp?.headers()?.['content-type'] || '';
      if (!String(viewerCt).includes('image/png')) {
        throw new Error(`Viewer QR did not return image/png (content-type=${viewerCt})`);
      }

      report.steps.push({ at: nowIso(), step: 'qr_fetch_mic', url: micQrUrl });
      const micResp = await qrCheck.goto(micQrUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const micCt = micResp?.headers()?.['content-type'] || '';
      if (!String(micCt).includes('image/png')) {
        throw new Error(`Mic QR did not return image/png (content-type=${micCt})`);
      }

      await qrCheck.close();
      report.steps.push({ at: nowIso(), step: 'qr_endpoints_ok' });
    }

    // Topic log panel should exist on viewer
    await host.waitForSelector('#topicLogCard', { timeout: 15000 });
    report.steps.push({ at: nowIso(), step: 'topic_log_present' });

    // Expand topic log and simulate a topic shift (UI-only) to confirm it updates live.
    await host.waitForSelector('#topicLogToggleBtn', { timeout: 15000 });
    await host.click('#topicLogToggleBtn');
    await host.evaluate(() => {
      // eslint-disable-next-line no-undef
      if (typeof handleTopicShift === 'function') {
        // eslint-disable-next-line no-undef
        handleTopicShift({ fromTopic: '', topic: 'Test Topic', subtopic: '', status: 'Deciding', confidence: 0.77 });
      }
    });
    await host.waitForFunction(
      () => {
        const el = document.getElementById('topicLogList');
        return el && (el.innerText || '').includes('Test Topic');
      },
      { timeout: 15000 }
    );
    report.steps.push({ at: nowIso(), step: 'topic_log_updates_live' });
    report.screenshots.push(await screenshot(host, '02b-topic-log-updated.png'));

    // Clicking a topic log row opens the topic summary modal (content may be "Loading…" depending on server/OAI)
    await host.waitForSelector('.topic-log-item', { timeout: 15000 });
    await host.evaluate(() => {
      const el = document.querySelector('.topic-log-item');
      el?.scrollIntoView({ block: 'center', inline: 'nearest' });
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await host.waitForSelector('#topicSummaryModal:not(.hidden)', { timeout: 15000 });
    await host.waitForSelector('#topicSummaryText', { timeout: 15000 });
    report.steps.push({ at: nowIso(), step: 'topic_summary_modal_opens' });
    report.screenshots.push(await screenshot(host, '02d-topic-summary-modal.png'));
    // Close modal
    await host.click('#topicSummaryClose');

    // --- MIC: join same room
    const mic = await ctx.newPage();
    mic.on('console', (msg) => {
      report.console.push({ page: 'mic', type: msg.type(), text: msg.text() });
    });
    mic.on('response', (resp) => {
      try {
        if (resp.status && resp.status() === 404) {
          report.console.push({ page: 'mic', type: 'http404', text: resp.url() });
        }
      } catch {}
    });

    report.steps.push({ at: nowIso(), step: 'open_mic', url: `${BASE_URL}/mic?room=${roomCode}` });
    await mic.goto(`${BASE_URL}/mic?room=${roomCode}`, { waitUntil: 'domcontentloaded' });
    await setLocalStorage(mic, { roombrief_name: 'ChromeMic' });
    await mic.reload({ waitUntil: 'domcontentloaded' });

    // Wait for mic screen to render (consent checkbox exists)
    await mic.waitForSelector('#consentCheckbox', { timeout: 15000 });
    report.screenshots.push(await screenshot(mic, '03-mic-opened.png'));

    // --- ASSERT: mic appears in viewer roster (connected/quiet)
    // Viewer page is the `host` tab now on /viewer.
    report.steps.push({ at: nowIso(), step: 'assert_mic_visible_in_viewer' });
    await host.bringToFront();
    // Give websocket time to propagate roster
    await host.waitForFunction(
      () => {
        const list = document.getElementById('micHealthList');
        if (!list) return false;
        return (list.innerText || '').toLowerCase().includes('chromemic');
      },
      { timeout: 15000 }
    );
    // Viewer mic reliability banner exists (may be hidden)
    await host.waitForSelector('#viewerMicBanner', { timeout: 15000 });

    report.screenshots.push(await screenshot(host, '04-viewer-mic-visible.png'));
    report.success = true;
    report.endedAt = nowIso();
    await writeJson('report.json', report);

    // Write a small text summary too
    const summary = [
      `Chrome E2E: ${report.success ? 'PASS' : 'FAIL'}`,
      `Base: ${BASE_URL}`,
      `Room: ${roomCode}`,
      `Viewer: ${viewerUrl}`,
      `Artifacts: ${OUT_DIR}`,
      ``,
    ].join('\n');
    await fs.writeFile(path.join(OUT_DIR, 'summary.txt'), summary);

    // Print to stdout for the caller
    // eslint-disable-next-line no-console
    console.log(summary);
  } catch (err) {
    report.success = false;
    report.endedAt = nowIso();
    report.error = { message: err?.message || String(err), stack: err?.stack || '' };
    await writeJson('report.json', report);
    // eslint-disable-next-line no-console
    console.error('Chrome E2E FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await run();


