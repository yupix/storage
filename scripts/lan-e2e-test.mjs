/**
 * LAN（STUN のみ）合言葉 P2P 転送 E2E 検証
 *
 * 使用例:
 *   API_BASE_URL=http://localhost:3400 WEB_BASE_URL=http://localhost:5175 \
 *     node scripts/lan-e2e-test.mjs --scenario all
 *
 * シナリオ: small | large | invalid-passphrase | all
 *
 * Preflight (E2E-ENV-001):
 *   - API / Web 稼働確認
 *   - Vite プロキシ先と API_BASE_URL の一致
 *   - WebSocket 直接接続プローブ（Vite WS プロキシは upgrade でハングする既知問題）
 */
import { chromium } from 'playwright'
import { writeFileSync, unlinkSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = process.env.API_BASE_URL ?? 'http://localhost:3400'
const WEB = process.env.WEB_BASE_URL ?? 'http://localhost:5175'
const SENDER_EMAIL = process.env.E2E_SENDER_EMAIL ?? 'turn_a@test.local'
const SENDER_PASS = process.env.E2E_SENDER_PASS ?? 'testpass123'
const RECEIVER_EMAIL = process.env.E2E_RECEIVER_EMAIL ?? 'turn_b@test.local'
const RECEIVER_PASS = process.env.E2E_RECEIVER_PASS ?? 'testpass123'
const WS_PROBE_TIMEOUT_MS = Number(process.env.E2E_WS_PROBE_TIMEOUT_MS ?? 8_000)

const scenarioArg = process.argv.find((a) => a.startsWith('--scenario='))
  ?? process.argv[process.argv.indexOf('--scenario') + 1]
  ?? 'all'

const CHROMIUM_ARGS = [
  '--enable-features=NetworkService,WebRtcHideLocalIpsWithMdns',
]

function apiWsUrl(apiBase = API) {
  const parsed = new URL(apiBase)
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${parsed.host}/v1/ws/watchword`
}

async function fetchOk(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${await res.text()}`)
  }
  return res
}

async function preflight(log) {
  log(`Preflight: API=${API} WEB=${WEB}`)

    const iceApi = await fetch(`${API}/v1/config/ice-servers`).then((r) => r.json())
    const iceWeb = await fetch(`${WEB}/v1/config/ice-servers`).then((r) => r.json())
    const apiJson = JSON.stringify(iceApi)
    const webJson = JSON.stringify(iceWeb)
    if (apiJson !== webJson) {
      throw new Error(
        `E2E-ENV-001: WEB proxy target differs from API_BASE_URL=${API}. ` +
          `direct=${apiJson} via_web=${webJson}. ` +
          'Vite を API_BASE_URL と一致させて再起動し、余分な API プロセスを停止せよ.',
      )
    }
    log('Preflight: WEB proxy ice-servers matches API direct')

  const webRes = await fetch(WEB, { redirect: 'manual' })
  if (webRes.status >= 500) {
    throw new Error(`WEB ${WEB} unhealthy: HTTP ${webRes.status}`)
  }
  log(`Preflight: WEB reachable (HTTP ${webRes.status})`)

  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS })
  try {
    const ctx = await browser.newContext({ baseURL: WEB })
    const loginRes = await ctx.request.post(`${WEB}/v1/auth/login`, {
      data: { email: RECEIVER_EMAIL, password: RECEIVER_PASS },
    })
    if (!loginRes.ok()) {
      throw new Error(`Preflight login failed: ${await loginRes.text()}`)
    }

    const page = await ctx.newPage()
    await page.goto(`${WEB}/receive`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

    const me = await page.evaluate(async () => {
      const res = await fetch('/v1/auth/me', { credentials: 'include' })
      return { ok: res.ok, status: res.status }
    })
    if (!me.ok) {
      throw new Error(
        `Preflight: session cookie not effective via WEB proxy (HTTP ${me.status}). ` +
          'Vite API_BASE_URL と実行中 dev サーバーの環境変数を一致させよ (E2E-ENV-001).',
      )
    }
    log('Preflight: REST session via WEB proxy OK')

    const wsDirect = await page.evaluate(
      async ({ wsUrl, timeoutMs }) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: false, state: 'timeout' }), timeoutMs)
          const ws = new WebSocket(wsUrl)
          ws.onopen = () => {
            clearTimeout(timer)
            ws.close()
            resolve({ ok: true })
          }
          ws.onclose = (event) => {
            clearTimeout(timer)
            resolve({ ok: false, state: 'closed', code: event.code, reason: event.reason })
          }
        }),
      { wsUrl: apiWsUrl(), timeoutMs: WS_PROBE_TIMEOUT_MS },
    )

    if (!wsDirect.ok) {
      throw new Error(
        `Preflight: direct WebSocket probe failed (${JSON.stringify(wsDirect)}). ` +
          `API ${API} が稼働し、Vite の API_BASE_URL と一致しているか確認せよ.`,
      )
    }
    log(`Preflight: direct WebSocket to ${apiWsUrl()} OK`)

    const wsViaVite = await page.evaluate(
      async ({ timeoutMs }) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: false, state: 'timeout' }), timeoutMs)
          const ws = new WebSocket(
            `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/v1/ws/watchword`,
          )
          ws.onopen = () => {
            clearTimeout(timer)
            ws.close()
            resolve({ ok: true })
          }
          ws.onclose = (event) => {
            clearTimeout(timer)
            resolve({ ok: false, state: 'closed', code: event.code })
          }
        }),
      { timeoutMs: 5_000 },
    )

    if (!wsViaVite.ok) {
      log(
        `Preflight: WARN Vite WS proxy not usable (${JSON.stringify(wsViaVite)}). ` +
          'getWatchwordWsUrl() は dev 時に API 直接接続を使用する想定.',
      )
    } else {
      log('Preflight: Vite WS proxy OK')
    }

    await ctx.close()
  } finally {
    await browser.close()
  }

  log('Preflight: PASS')
}

async function loginViaApi(browser, email, password) {
  const ctx = await browser.newContext({ baseURL: WEB })
  const res = await ctx.request.post(`${WEB}/v1/auth/login`, {
    data: { email, password },
  })
  if (!res.ok()) {
    throw new Error(`login failed for ${email}: ${await res.text()}`)
  }
  return ctx
}

async function dumpDebugState(senderPage, receiverPage, log) {
  const senderText = await senderPage.locator('body').innerText()
  const receiverText = await receiverPage.locator('body').innerText()
  log('[DEBUG] --- sender page (first 2000 chars) ---')
  log(senderText.slice(0, 2000))
  log('[DEBUG] --- receiver page (first 2000 chars) ---')
  log(receiverText.slice(0, 2000))

  const states = await Promise.all([
    senderPage.evaluate(() => ({
      url: location.href,
      wsState: window.__watchwordDebug?.wsReadyState ?? null,
    })),
    receiverPage.evaluate(() => ({
      url: location.href,
      wsState: window.__watchwordDebug?.wsReadyState ?? null,
    })),
  ]).catch(() => [{}, {}])

  log(`[DEBUG] page state: ${JSON.stringify(states)}`)
}

async function runShareReceive(senderPage, receiverPage, filePath, log) {
  await senderPage.goto(`${WEB}/share`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await receiverPage.goto(`${WEB}/receive`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await senderPage.locator('input[type="file"]').setInputFiles(filePath)
  await senderPage.getByRole('button', { name: '送信を開始' }).click()

  const passphraseEl = senderPage.locator('p.text-2xl.font-mono')
  await passphraseEl.waitFor({ timeout: 30_000 })
  const passphrase = (await passphraseEl.textContent())?.trim()
  if (!passphrase) throw new Error('passphrase not found')
  log(`[DEBUG] passphrase=${passphrase}`)

  await receiverPage.fill('#passphrase', passphrase)
  await receiverPage.getByRole('button', { name: '受信を開始' }).click()

  try {
    await receiverPage.getByText('✅ 完了').waitFor({ timeout: 300_000 })
  } catch (err) {
    await dumpDebugState(senderPage, receiverPage, log)
    throw err
  }

  const bodyText = await receiverPage.locator('body').innerText()
  const hashOk =
    /整合性|ハッシュ|一致|✅/.test(bodyText) &&
    !(await receiverPage.getByText(/整合性チェックに失敗|不一致/i).count())

  return { passphrase, hashOk }
}

async function testInvalidPassphrase(receiverPage) {
  await receiverPage.goto(`${WEB}/receive`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await receiverPage.fill('#passphrase', 'zzzzzzzz')
  await receiverPage.getByRole('button', { name: '受信を開始' }).click()

  await receiverPage
    .getByText(/合言葉が正しくない|ルームの有効期限/i)
    .waitFor({ timeout: 30_000 })
}

async function main() {
  const logs = []
  const log = (msg) => {
    console.log(msg)
    logs.push(`[${new Date().toISOString()}] ${msg}`)
  }

  const runSmall = scenarioArg === 'small' || scenarioArg === 'all'
  const runLarge = scenarioArg === 'large'
  const runInvalid = scenarioArg === 'invalid-passphrase' || scenarioArg === 'all'

  const tmpDir = mkdtempSync(join(tmpdir(), 'lan-e2e-'))
  const results = { small: null, large: null, invalidPassphrase: null }

  await preflight(log)

  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS })

  try {
    if (runInvalid) {
      log('=== Scenario: invalid-passphrase ===')
      const receiverCtx = await loginViaApi(browser, RECEIVER_EMAIL, RECEIVER_PASS)
      const receiverPage = await receiverCtx.newPage()
      await testInvalidPassphrase(receiverPage)
      results.invalidPassphrase = 'PASS'
      log('invalid-passphrase: PASS')
      await receiverCtx.close()
    }

    if (runSmall || runLarge) {
      const sizeMb = runLarge ? 100 : 1
      const testFile = join(tmpDir, runLarge ? 'large-100mb.bin' : 'small-1mb.bin')
      log(`Creating test file (${sizeMb}MB)...`)
      const chunk = Buffer.alloc(1024 * 1024, 0xcd)
      const fd = await import('node:fs/promises').then((fs) =>
        fs.open(testFile, 'w'),
      )
      for (let i = 0; i < sizeMb; i++) {
        await fd.write(chunk)
      }
      await fd.close()

      const senderCtx = await loginViaApi(browser, SENDER_EMAIL, SENDER_PASS)
      const receiverCtx = await loginViaApi(browser, RECEIVER_EMAIL, RECEIVER_PASS)
      const senderPage = await senderCtx.newPage()
      const receiverPage = await receiverCtx.newPage()

      log(`=== Scenario: ${runLarge ? 'large' : 'small'} (${sizeMb}MB) ===`)
      const transfer = await runShareReceive(senderPage, receiverPage, testFile, log)
      log(`Transfer passphrase=${transfer.passphrase} hashOk=${transfer.hashOk}`)

      if (!transfer.hashOk) {
        throw new Error('filehash verification UI did not show success')
      }

      if (runLarge) results.large = 'PASS'
      else results.small = 'PASS'
      log(`${runLarge ? 'large' : 'small'}: PASS`)

      await senderCtx.close()
      await receiverCtx.close()
      if (existsSync(testFile)) unlinkSync(testFile)
    }
  } finally {
    await browser.close()
  }

  const logPath = join(tmpDir, 'lan-e2e-log.txt')
  writeFileSync(logPath, logs.join('\n'), 'utf8')
  writeFileSync('/tmp/debug_e2e_lan_small.log', logs.join('\n'), 'utf8')
  log(`Log: ${logPath}`)
  log(`Debug log: /tmp/debug_e2e_lan_small.log`)
  log(`Results: ${JSON.stringify(results)}`)
  log('LAN E2E PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
