import { test } from '@japa/runner'
import { StorageService } from '#services/storage_service'
import env from '#start/env'

test.group('StorageService', () => {
  test('storeResult stores PDF and returns signed download URL', async ({ assert }) => {
    const service = new StorageService('1h')

    const pdfBuffer = Buffer.from('%PDF-1.4 fake content')
    const result = await service.storeResult(pdfBuffer, 'test.pdf', [])

    assert.isString(result.downloadUrl)
    assert.match(result.downloadUrl, /\/downloads\/pdfs\//)
    assert.match(result.downloadUrl, /signature=/)
    assert.deepEqual(result.thumbnailDownloadUrls, [])
  })

  test('storeResult stores thumbnails and returns signed URLs', async ({ assert }) => {
    const service = new StorageService('1h')

    const pdfBuffer = Buffer.from('%PDF-1.4 fake content')
    // Create a fake PNG thumbnail (PNG signature starts with 0x89504E47)
    const fakePngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString(
      'base64'
    )
    const thumbnails = [{ page: 1, image: fakePngBase64, width: 100, height: 141 }]

    const result = await service.storeResult(pdfBuffer, 'test.pdf', thumbnails)

    assert.lengthOf(result.thumbnailDownloadUrls, 1)
    assert.equal(result.thumbnailDownloadUrls[0].page, 1)
    assert.match(result.thumbnailDownloadUrls[0].downloadUrl, /\/downloads\/pdfs\//)
    assert.match(result.thumbnailDownloadUrls[0].downloadUrl, /page-1\.png/)
  })
})

test.group('PDF Storage Integration', () => {
  test('pdf endpoint returns downloadUrl when PDF_STORAGE_ENABLED is true', async ({
    client,
    assert,
  }) => {
    if (!env.get('PDF_STORAGE_ENABLED', false)) {
      return
    }

    const response = await client.post('/api/pdf').json({
      html: '<html><body><h1>Hello PDF</h1></body></html>',
    })

    response.assertStatus(200)
    const body = response.body()

    assert.notProperty(body, 'data')
    assert.property(body, 'downloadUrl')
    assert.isString(body.downloadUrl)
    assert.match(body.downloadUrl, /\/downloads\/pdfs\//)
  })

  test('pdf endpoint omits downloadUrl when PDF_STORAGE_ENABLED is false', async ({
    client,
    assert,
  }) => {
    if (env.get('PDF_STORAGE_ENABLED', false)) {
      return
    }

    const response = await client.post('/api/pdf').json({
      html: '<html><body><h1>Hello PDF</h1></body></html>',
    })

    response.assertStatus(200)
    const body = response.body()

    assert.property(body, 'data')
    assert.notProperty(body, 'downloadUrl')
  })
})
