/**
 * LAN（STUN のみ）合言葉 P2P 転送 E2E 検証
 *
 * 使用例:
 *   API_BASE_URL=http://localhost:3400 WEB_BASE_URL=http://localhost:5175 \
 *     node scripts/lan-e2e-test.mjs --scenario all
 *
 * シナリオ: small | large | invalid-passphrase | all
 */
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { writeFileSync, unlinkSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = process.env.API_BASE_URL ?? 'http://localhost:3400'
const WEB = process.env.WEB_BASE_URL ?? 'http://localhost:5175'
const SENDER_EMAIL = process.env.E2E_SENDER_EMAIL ?? 'turn_a@test.local'
const SENDER_PASS = process.env.E2E_SENDER_PASS ?? 'testpass123'
const RECEIVER_EMAIL = process.env.E2E_RECEIVER_EMAIL ?? 'turn_b@test.local'
const RECEIVER_PASS = process.env.E2E_RECEIVER_PASS ?? 'testpass123'

const scenarioArg = process.argv.find((a) => a.startsWith('--scenario='))
  ?? process.argv[process.argv.indexOf('--scenario') + 1]
  ?? 'all'

async function loginViaApi(browser, email, password) {
  const ctx = await browser.newContext({ baseURL: WEB })
  const res = await ctx.request.post('/v1/auth/login', {
    data: { email, password },
  })
  if (!res.ok()) {
    throw new Error(`login failed for ${email}: ${await res.text()}`)
  }
  return ctx
}

async function runShareReceive(senderPage, receiverPage, filePath) {
  await senderPage.goto(`${WEB}/share`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await receiverPage.goto(`${WEB}/receive`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await senderPage.locator('input[type="file"]').setInputFiles(filePath)
  await senderPage.getByRole('button', { name: '送信を開始' }).click()

  const passphraseEl = senderPage.locator('p.text-2xl.font-mono')
  await passphraseEl.waitFor({ timeout: 30_000 })
  const passphrase = (await passphraseEl.textContent())?.trim()
  if (!passphrase) throw new Error('passphrase not found')

  await receiverPage.fill('#passphrase', passphrase)
  await receiverPage.getByRole('button', { name: '受信を開始' }).click()

  await receiverPage.getByText('✅ 完了').waitFor({ timeout: 300_000 })

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

  const browser = await chromium.launch({ headless: true })

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
      const transfer = await runShareReceive(senderPage, receiverPage, testFile)
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
  log(`Log: ${logPath}`)
  log(`Results: ${JSON.stringify(results)}`)
  log('LAN E2E PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
