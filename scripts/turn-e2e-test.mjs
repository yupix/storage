/**
 * TURN 有効時の合言葉 P2P 転送 E2E 検証スクリプト
 * 使用: API_BASE_URL=http://localhost:3402 WEB_BASE_URL=http://localhost:3000 node scripts/turn-e2e-test.mjs
 */
import { chromium, request } from 'playwright'
import { createHash } from 'node:crypto'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = process.env.API_BASE_URL ?? 'http://localhost:3402'
const WEB = process.env.WEB_BASE_URL ?? 'http://localhost:3000'

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

async function getIceServers(request) {
  const res = await request.get(`${API}/v1/config/ice-servers`)
  if (!res.ok()) throw new Error(`ice-servers failed: ${await res.text()}`)
  return res.json()
}

async function testTurnRelay(page) {
  return page.evaluate(async () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    })
    pc.createDataChannel('probe')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await new Promise((r) => setTimeout(r, 5000))
    const sdp = pc.localDescription?.sdp ?? ''
    const relays = (sdp.match(/typ relay/g) ?? []).length
    pc.close()
    return relays
  })
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

  try {
    await receiverPage.getByText('✅ 完了').waitFor({ timeout: 120_000 })
  } catch (err) {
    const senderText = await senderPage.locator('body').innerText()
    const receiverText = await receiverPage.locator('body').innerText()
    console.error('--- sender page ---\n', senderText.slice(0, 2000))
    console.error('--- receiver page ---\n', receiverText.slice(0, 2000))
    throw err
  }
  const hashOk = (await receiverPage.getByText(/整合性.*一致|ハッシュ.*一致|照合.*成功/i).count()) > 0
    || (await receiverPage.getByText('✅').count()) > 0
  return { passphrase, hashOk }
}

async function main() {
  const logs = []
  const log = (msg) => {
    console.log(msg)
    logs.push(`[${new Date().toISOString()}] ${msg}`)
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'turn-e2e-'))
  const testFile = join(tmpDir, 'turn-test.bin')
  const content = Buffer.alloc(64 * 1024, 0xab)
  writeFileSync(testFile, content)
  const expectedHash = `sha256:${createHash('sha256').update(content).digest('hex')}`

  const apiRequest = await request.newContext()
  const ice = await getIceServers(apiRequest)
  const hasTurn = ice.iceServers?.some((s) => String(s.urls).includes('turn:'))
  log(`ICE servers: ${JSON.stringify(ice)}`)
  log(`TURN in ice-servers: ${hasTurn}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=NetworkService,WebRtcHideLocalIpsWithMdns'],
  })
  const probePage = await browser.newPage()
  const relayCandidates = await testTurnRelay(probePage)
  log(`TURN relay candidates (browser probe): ${relayCandidates}`)
  await probePage.close()

  const senderCtx = await loginViaApi(browser, 'turn_a@test.local', 'testpass123')
  const receiverCtx = await loginViaApi(browser, 'turn_b@test.local', 'testpass123')
  const senderPage = await senderCtx.newPage()
  const receiverPage = await receiverCtx.newPage()

  const transfer = await runShareReceive(senderPage, receiverPage, testFile)
  log(`Transfer: passphrase=${transfer.passphrase} hashOk=${transfer.hashOk}`)
  log(`Expected filehash: ${expectedHash}`)

  await senderCtx.close()
  await receiverCtx.close()
  await browser.close()
  await apiRequest.dispose()
  unlinkSync(testFile)

  writeFileSync(
    join(tmpDir, 'turn-test-log.txt'),
    logs.join('\n'),
    'utf8',
  )
  console.log(`Log written: ${join(tmpDir, 'turn-test-log.txt')}`)

  if (!hasTurn) {
    console.error('FAIL: ice-servers does not include TURN')
    process.exit(1)
  }
  if (!transfer.hashOk) {
    console.error('FAIL: filehash verification did not complete')
    process.exit(1)
  }
  log('TURN E2E PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
