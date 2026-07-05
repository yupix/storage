/**
 * 複数 joiner（v2 ルーム）E2E 検証
 *
 * 使用例:
 *   API_BASE_URL=http://localhost:3400 WEB_BASE_URL=http://localhost:5175 \
 *     node scripts/multi-joiner-e2e-test.mjs
 *
 * シナリオ:
 *   - 2 joiner が同一合言葉で同時受信完了（hash 照合）
 *   - room_full（WS 層、max_joiners=2 のルームに 3 人目 join）
 */
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdtempSync, existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = process.env.API_BASE_URL ?? 'http://localhost:3400'
const WEB = process.env.WEB_BASE_URL ?? 'http://localhost:5175'
const CREATOR_EMAIL = process.env.E2E_CREATOR_EMAIL ?? 'turn_a@test.local'
const RECEIVER_A_EMAIL = process.env.E2E_RECEIVER_A_EMAIL ?? 'turn_b@test.local'
const RECEIVER_B_EMAIL = process.env.E2E_RECEIVER_B_EMAIL ?? 'e2e_c@test.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'testpass123'

const CHROMIUM_ARGS = [
  '--enable-features=NetworkService,WebRtcHideLocalIpsWithMdns',
]

function apiWsUrl() {
  const parsed = new URL(API)
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${parsed.host}/v1/ws/watchword`
}

async function loginViaWeb(browser, email) {
  const ctx = await browser.newContext({ baseURL: WEB })
  const res = await ctx.request.post(`${WEB}/v1/auth/login`, {
    data: { email, password: PASSWORD },
  })
  if (!res.ok()) {
    throw new Error(`login failed for ${email}: ${await res.text()}`)
  }
  return ctx
}

async function preflight(log) {
  log(`Preflight: API=${API} WEB=${WEB}`)
  const iceApi = await fetch(`${API}/v1/config/ice-servers`).then((r) => r.json())
  const iceWeb = await fetch(`${WEB}/v1/config/ice-servers`).then((r) => r.json())
  if (JSON.stringify(iceApi) !== JSON.stringify(iceWeb)) {
    throw new Error(
      `E2E-ENV-001: WEB proxy ice-servers mismatch. Restart Vite with API_BASE_URL=${API}`,
    )
  }
  log('Preflight: ice-servers match')
}

async function dumpPages(creatorPage, receiverAPage, receiverBPage, log) {
  for (const [label, page] of [
    ['Creator', creatorPage],
    ['Receiver A', receiverAPage],
    ['Receiver B', receiverBPage],
  ]) {
    const text = await page.locator('body').innerText()
    log(`[DEBUG] ${label}:\n${text.slice(0, 1200)}`)
  }
}

async function waitReceiverComplete(page, label, log, creatorPage, receiverAPage) {
  try {
    await page.getByText('✅ 完了').waitFor({ timeout: 300_000 })
  } catch (err) {
    if (creatorPage && receiverAPage) {
      await dumpPages(creatorPage, receiverAPage, page, log)
    } else {
      const text = await page.locator('body').innerText()
      log(`[DEBUG] ${label} page:\n${text.slice(0, 2000)}`)
    }
    throw err
  }
  const bodyText = await page.locator('body').innerText()
  const hashOk =
    /整合性|ハッシュ|一致|✅/.test(bodyText) &&
    !(await page.getByText(/整合性チェックに失敗|不一致/i).count())
  return hashOk
}

async function runMultiJoinerTransfer(
  creatorPage,
  receiverAPage,
  receiverBPage,
  filePath,
  log,
) {
  await creatorPage.goto(`${WEB}/share`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await receiverAPage.goto(`${WEB}/receive`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await receiverBPage.goto(`${WEB}/receive`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await creatorPage.locator('input[type="file"]').setInputFiles(filePath)
  await creatorPage.getByRole('button', { name: '送信を開始' }).click()

  const passphraseEl = creatorPage.locator('p.text-2xl.font-mono')
  await passphraseEl.waitFor({ timeout: 30_000 })
  const passphrase = (await passphraseEl.textContent())?.trim()
  if (!passphrase) throw new Error('passphrase not found')
  log(`passphrase=${passphrase}`)

  await creatorPage.getByText(/受信者の接続を待っています|ファイル送信中|受信者 .* との接続/).waitFor({
    timeout: 60_000,
  })
  log('Creator: WS create ready, receivers may join')

  await receiverAPage.fill('#passphrase', passphrase)
  await receiverAPage.getByRole('button', { name: '受信を開始' }).click()
  log('Receiver A: join started')

  await receiverBPage.fill('#passphrase', passphrase)
  await receiverBPage.getByRole('button', { name: '受信を開始' }).click()
  log('Receiver B: join started (simultaneous multi-joiner)')

  const [hashA, hashB] = await Promise.all([
    waitReceiverComplete(receiverAPage, 'Receiver A', log, creatorPage, receiverBPage),
    waitReceiverComplete(receiverBPage, 'Receiver B', log, creatorPage, receiverAPage),
  ])

  log(`Receiver A hashOk=${hashA}, Receiver B hashOk=${hashB}`)
  if (!hashA || !hashB) {
    throw new Error('filehash verification failed for one or more joiners')
  }
  return { passphrase, hashA, hashB }
}

async function testRoomFullViaRest(log) {
  async function loginCookie(email) {
    const res = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    if (!res.ok) throw new Error(`login failed for ${email}`)
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  }

  const creatorCookie = await loginCookie(CREATOR_EMAIL)
  const joinerEmails = [RECEIVER_A_EMAIL, RECEIVER_B_EMAIL, 'e2e_a@test.local']
  const joinerCookies = await Promise.all(joinerEmails.map(loginCookie))

  const me = await fetch(`${API}/v1/auth/me`, { headers: { Cookie: creatorCookie } }).then((r) =>
    r.json(),
  )
  const createRes = await fetch(`${API}/v1/files/watchword`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: creatorCookie },
    body: JSON.stringify({
      protocol: 2,
      max_joiners: 2,
      filename: 'probe.bin',
      file_type: 'bin',
      filesize: 64,
      mime_type: 'application/octet-stream',
      sender_id: me.id,
      receiver_id: '00000000-0000-0000-0000-000000000000',
      filehash:
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chunk_size: 16384,
      downloadable: true,
    }),
  })
  if (!createRes.ok) throw new Error(`create failed: ${await createRes.text()}`)
  const { passphrase } = await createRes.json()

  const join = async (cookie) =>
    fetch(`${API}/v1/files/watchword/${passphrase}/join`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })

  const j1 = await join(joinerCookies[0])
  const j2 = await join(joinerCookies[1])
  const j3 = await join(joinerCookies[2])

  log(`room_full probe passphrase=${passphrase}`)
  log(`join1 status=${j1.status}`)
  log(`join2 status=${j2.status}`)
  log(`join3 status=${j3.status} body=${await j3.text()}`)

  if (j1.status !== 200 || j2.status !== 200) {
    throw new Error(`expected first two REST joins to succeed (${j1.status}, ${j2.status})`)
  }
  if (j3.status !== 409) {
    throw new Error(`expected HTTP 409 on 3rd join, got ${j3.status}`)
  }
  log('room_full: PASS (REST 409 on 3rd join)')
}

async function main() {
  const logs = []
  const log = (msg) => {
    console.log(msg)
    logs.push(`[${new Date().toISOString()}] ${msg}`)
  }

  const results = { multiJoiner: null, roomFull: null }
  await preflight(log)

  const tmpDir = mkdtempSync(join(tmpdir(), 'multi-joiner-e2e-'))
  const testFile = join(tmpDir, 'multi-256kb.bin')
  const content = Buffer.alloc(256 * 1024, 0xef)
  writeFileSync(testFile, content)
  const expectedHash = `sha256:${createHash('sha256').update(content).digest('hex')}`
  log(`test file hash=${expectedHash}`)

  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS })

  try {
    log('=== Scenario: multi-joiner (2 receivers) ===')
    const creatorCtx = await loginViaWeb(browser, CREATOR_EMAIL)
    const receiverACtx = await loginViaWeb(browser, RECEIVER_A_EMAIL)
    const receiverBCtx = await loginViaWeb(browser, RECEIVER_B_EMAIL)

    const creatorPage = await creatorCtx.newPage()
    const receiverAPage = await receiverACtx.newPage()
    const receiverBPage = await receiverBCtx.newPage()
    for (const [label, page] of [
      ['creator', creatorPage],
      ['recvA', receiverAPage],
      ['recvB', receiverBPage],
    ]) {
      page.on('console', (msg) => log(`[${label} console] ${msg.text()}`))
      page.on('pageerror', (err) => log(`[${label} error] ${err.message}`))
    }

    const transfer = await runMultiJoinerTransfer(
      creatorPage,
      receiverAPage,
      receiverBPage,
      testFile,
      log,
    )
    log(`multi-joiner transfer: passphrase=${transfer.passphrase}`)
    results.multiJoiner = 'PASS'
    log('multi-joiner: PASS')

    await creatorCtx.close()
    await receiverACtx.close()
    await receiverBCtx.close()

    log('=== Scenario: room_full (REST) ===')
    await testRoomFullViaRest(log)
    results.roomFull = 'PASS'
  } finally {
    await browser.close()
    if (existsSync(testFile)) unlinkSync(testFile)
  }

  const logPath = join(tmpDir, 'multi-joiner-e2e-log.txt')
  writeFileSync(logPath, logs.join('\n'), 'utf8')
  writeFileSync('/tmp/debug_e2e_multi_joiner.log', logs.join('\n'), 'utf8')
  log(`Log: ${logPath}`)
  log(`Results: ${JSON.stringify(results)}`)
  log('MULTI-JOINER E2E PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
