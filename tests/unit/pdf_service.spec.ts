import { test } from '@japa/runner'
import assert from 'node:assert/strict'
import { buildChromiumLaunchArgs, PdfService, selectThumbnailPages } from '#services/pdf_service'

test('pdf service retries browser launch after an initial failure', async () => {
  const service = new PdfService()
  let closeCalls = 0
  let attempts = 0

  const fakeBrowser = {
    close: async () => {
      closeCalls++
    },
  }

  ;(service as any).launchBrowser = async () => {
    attempts++

    if (attempts === 1) {
      throw new Error('boom')
    }

    return fakeBrowser
  }

  await assert.rejects((service as any).getBrowser(), /boom/)
  assert.equal((service as any).launching, null)

  const browser = await (service as any).getBrowser()

  assert.equal(browser, fakeBrowser)
  assert.equal(attempts, 2)

  await service.shutdown()
  assert.equal(closeCalls, 1)
})

test('pdf service strips unsafe sandbox flags unless explicitly enabled', async () => {
  const args = buildChromiumLaunchArgs(
    ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
    false
  )

  assert.deepEqual(args, ['--disable-dev-shm-usage'])
})

test('pdf service keeps sandbox flags when explicitly enabled', async () => {
  const args = buildChromiumLaunchArgs(
    ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
    true
  )

  assert.deepEqual(args, ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'])
})

test('pdf service caps and deduplicates thumbnail pages defensively', async () => {
  const pages = selectThumbnailPages(12, [3, 3, 1, 99, 2, 4], 3)

  assert.deepEqual(pages, [3, 1, 2])
})
