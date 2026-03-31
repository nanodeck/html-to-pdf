import { test } from '@japa/runner'
import { CleanupService } from '#services/cleanup_service'
import drive from '@adonisjs/drive/services/main'

test.group('CleanupService', (group) => {
  group.each.setup(async () => {
    const disk = drive.use()
    await disk.deleteAll('pdfs/')
  })

  test('findExpiredPrefixes returns prefixes older than retention', async ({ assert }) => {
    const disk = drive.use()

    await disk.put('pdfs/old-uuid/document.pdf', 'fake-pdf', {
      contentType: 'application/pdf',
    })
    await disk.put('pdfs/old-uuid/thumbnails/page-1.png', 'fake-thumb', {
      contentType: 'image/png',
    })

    await disk.put('pdfs/new-uuid/document.pdf', 'fake-pdf', {
      contentType: 'application/pdf',
    })

    // With a very long retention, nothing should be expired
    const serviceLong = new CleanupService('7d')
    const expiredLong = await serviceLong.findExpiredPrefixes()
    assert.lengthOf(expiredLong, 0)

    // With 1ms retention, both should be expired (they were written > 1ms ago)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const serviceShort = new CleanupService('1ms')
    const expiredShort = await serviceShort.findExpiredPrefixes()
    assert.lengthOf(expiredShort, 2)

    const prefixes = expiredShort.map((e) => e.prefix).sort()
    assert.deepEqual(prefixes, ['pdfs/new-uuid/', 'pdfs/old-uuid/'])
  })

  test('findExpiredPrefixes returns empty when no files exist', async ({ assert }) => {
    const service = new CleanupService('24h')
    const expired = await service.findExpiredPrefixes()
    assert.lengthOf(expired, 0)
  })

  test('deletePrefixes removes all files under each prefix and returns count', async ({
    assert,
  }) => {
    const disk = drive.use()

    await disk.put('pdfs/uuid-1/doc.pdf', 'fake', { contentType: 'application/pdf' })
    await disk.put('pdfs/uuid-1/thumbnails/page-1.png', 'fake', { contentType: 'image/png' })
    await disk.put('pdfs/uuid-2/doc.pdf', 'fake', { contentType: 'application/pdf' })

    const service = new CleanupService('24h')
    const count = await service.deletePrefixes([
      { prefix: 'pdfs/uuid-1/', lastModified: new Date() },
      { prefix: 'pdfs/uuid-2/', lastModified: new Date() },
    ])

    assert.equal(count, 2)
    assert.isFalse(await disk.exists('pdfs/uuid-1/doc.pdf'))
    assert.isFalse(await disk.exists('pdfs/uuid-1/thumbnails/page-1.png'))
    assert.isFalse(await disk.exists('pdfs/uuid-2/doc.pdf'))
  })

  test('deletePrefixes handles empty array gracefully', async ({ assert }) => {
    const service = new CleanupService('24h')
    const count = await service.deletePrefixes([])
    assert.equal(count, 0)
  })
})

test.group('CleanupService retention parsing', () => {
  test('parses hours correctly', ({ assert }) => {
    assert.doesNotThrow(() => new CleanupService('24h'))
    assert.doesNotThrow(() => new CleanupService('1h'))
  })

  test('parses days correctly', ({ assert }) => {
    assert.doesNotThrow(() => new CleanupService('7d'))
    assert.doesNotThrow(() => new CleanupService('30d'))
  })

  test('parses minutes and seconds', ({ assert }) => {
    assert.doesNotThrow(() => new CleanupService('30m'))
    assert.doesNotThrow(() => new CleanupService('60s'))
    assert.doesNotThrow(() => new CleanupService('500ms'))
  })

  test('rejects invalid retention strings', ({ assert }) => {
    assert.throws(() => new CleanupService('invalid'), /Invalid retention format/)
    assert.throws(() => new CleanupService(''), /Invalid retention format/)
    assert.throws(() => new CleanupService('24x'), /Invalid retention format/)
    assert.throws(() => new CleanupService('abc'), /Invalid retention format/)
  })
})
