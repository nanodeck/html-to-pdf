import { test } from '@japa/runner'
import env from '#start/env'

const storageEnabled = env.get('PDF_STORAGE_ENABLED', false)

test('pdf endpoint returns JSON with base64 pdf', async ({ client, assert }) => {
  const response = await client
    .post('/api/pdf')
    .json({ html: '<html><body><h1>Hello PDF</h1></body></html>' })

  response.assertStatus(200)
  assert.equal(response.header('content-type'), 'application/json; charset=utf-8')

  const body = response.body()
  assert.property(body, 'filename')
  assert.property(body, 'thumbnails')
  assert.isArray(body.thumbnails)
  assert.lengthOf(body.thumbnails, 0)

  if (storageEnabled) {
    assert.notProperty(body, 'data')
    assert.property(body, 'downloadUrl')
  } else {
    assert.property(body, 'data')
    assert.notProperty(body, 'downloadUrl')

    const pdfBuffer = Buffer.from(body.data, 'base64')
    const header = pdfBuffer.subarray(0, 5).toString('utf8')
    assert.ok(header.startsWith('%PDF-'), `Expected PDF header, got: ${header}`)
  }
})

test('pdf endpoint enforces max html size', async ({ client }) => {
  const maxBytes = env.get('PDF_MAX_HTML_SIZE')
  const html = 'a'.repeat(maxBytes + 1)

  const response = await client.post('/api/pdf').json({ html })

  response.assertStatus(413)
  response.assertBodyContains({
    error: 'HTML payload too large',
    maxBytes,
    actualBytes: Buffer.byteLength(html, 'utf8'),
  })
})

test('pdf endpoint rejects invalid pdf options with 422', async ({ client, assert }) => {
  const response = await client.post('/api/pdf').json({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    options: {
      scale: 3,
      width: 'twelve',
    },
  })

  response.assertStatus(422)
  assert.notProperty(response.body(), 'data')
})

test('pdf endpoint sanitizes filename', async ({ client, assert }) => {
  const response = await client.post('/api/pdf').json({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    filename: 'My Report (final).pdf',
  })

  response.assertStatus(200)
  const body = response.body()
  assert.equal(body.filename, 'My_Report__final_.pdf')
})

test('pdf endpoint generates thumbnails when enabled', async ({ client, assert }) => {
  const response = await client.post('/api/pdf').json({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    thumbnail: {
      enabled: true,
      width: 100,
    },
  })

  response.assertStatus(200)
  const body = response.body()

  assert.isArray(body.thumbnails)
  assert.isAbove(body.thumbnails.length, 0)

  const thumbnail = body.thumbnails[0]
  assert.property(thumbnail, 'page')
  assert.property(thumbnail, 'width')
  assert.property(thumbnail, 'height')
  assert.equal(thumbnail.page, 1)
  assert.equal(thumbnail.width, 100)

  if (storageEnabled) {
    assert.property(thumbnail, 'downloadUrl')
    assert.notProperty(thumbnail, 'data')
  } else {
    assert.property(thumbnail, 'data')
    assert.notProperty(thumbnail, 'downloadUrl')

    // Verify it's a valid PNG (starts with PNG signature)
    const imageBuffer = Buffer.from(thumbnail.data, 'base64')
    const pngSignature = imageBuffer.subarray(0, 4).toString('hex')
    assert.equal(pngSignature, '89504e47', 'Expected PNG signature')
  }
})

test('pdf endpoint generates jpeg thumbnails when format is jpeg', async ({ client, assert }) => {
  const response = await client.post('/api/pdf').json({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    thumbnail: {
      enabled: true,
      width: 100,
      format: 'jpeg',
    },
  })

  response.assertStatus(200)
  const body = response.body()

  assert.isArray(body.thumbnails)
  assert.isAbove(body.thumbnails.length, 0)

  if (!storageEnabled) {
    const thumbnail = body.thumbnails[0]

    // Verify it's a valid JPEG (starts with FFD8)
    const imageBuffer = Buffer.from(thumbnail.data, 'base64')
    const jpegSignature = imageBuffer.subarray(0, 2).toString('hex')
    assert.equal(jpegSignature, 'ffd8', 'Expected JPEG signature')
  }
})

test('pdf endpoint generates thumbnails for specific pages', async ({ client, assert }) => {
  // Create a multi-page PDF using page breaks
  const html = `
    <html>
      <body>
        <div style="page-break-after: always;">Page 1</div>
        <div style="page-break-after: always;">Page 2</div>
        <div>Page 3</div>
      </body>
    </html>
  `

  const response = await client.post('/api/pdf').json({
    html,
    thumbnail: {
      enabled: true,
      pages: [1, 3],
    },
  })

  response.assertStatus(200)
  const body = response.body()

  assert.isArray(body.thumbnails)
  assert.lengthOf(body.thumbnails, 2)
  assert.equal(body.thumbnails[0].page, 1)
  assert.equal(body.thumbnails[1].page, 3)
})

test('pdf endpoint rejects thumbnail page lists above the configured limit', async ({ client }) => {
  const maxThumbnailPages = env.get('PDF_MAX_THUMBNAIL_PAGES', 10)

  const response = await client.post('/api/pdf').json({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    thumbnail: {
      enabled: true,
      pages: Array.from({ length: maxThumbnailPages + 1 }, (_, index) => index + 1),
    },
  })

  response.assertStatus(422)
})

test('pdf endpoint caps automatic thumbnail generation to the configured max', async ({
  client,
  assert,
}) => {
  const maxThumbnailPages = env.get('PDF_MAX_THUMBNAIL_PAGES', 10)
  const pagesHtml = Array.from(
    { length: maxThumbnailPages + 2 },
    (_, index) => `<div style="page-break-after: always;">Page ${index + 1}</div>`
  ).join('')
  const html = `
    <html>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `

  const response = await client.post('/api/pdf').json({
    html,
    thumbnail: {
      enabled: true,
    },
  })

  response.assertStatus(200)
  const body = response.body()

  assert.lengthOf(body.thumbnails, maxThumbnailPages)
  assert.equal(body.thumbnails[0].page, 1)
  assert.equal(body.thumbnails.at(-1)?.page, maxThumbnailPages)
})

test('pdf endpoint de-duplicates thumbnail page requests', async ({ client, assert }) => {
  const html = `
    <html>
      <body>
        <div style="page-break-after: always;">Page 1</div>
        <div style="page-break-after: always;">Page 2</div>
        <div>Page 3</div>
      </body>
    </html>
  `

  const response = await client.post('/api/pdf').json({
    html,
    thumbnail: {
      enabled: true,
      pages: [2, 2, 1],
    },
  })

  response.assertStatus(200)
  const body = response.body()

  assert.lengthOf(body.thumbnails, 2)
  assert.deepEqual(
    body.thumbnails.map((thumbnail: { page: number }) => thumbnail.page),
    [2, 1]
  )
})

test('pdf endpoint returns empty thumbnails array when disabled', async ({ client, assert }) => {
  const response = await client.post('/api/pdf').json({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    thumbnail: {
      enabled: false,
    },
  })

  response.assertStatus(200)
  const body = response.body()
  assert.isArray(body.thumbnails)
  assert.lengthOf(body.thumbnails, 0)
})
