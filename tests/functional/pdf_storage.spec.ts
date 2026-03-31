import { test } from '@japa/runner'
import { StorageService } from '#services/storage_service'
import registerPdfMcp from '#mcp/html_to_pdf'
import env from '#start/env'

type ToolHandler = (input: {
  html: string
  options?: unknown
  thumbnail?: { enabled: boolean; width?: number; pages?: number[]; format?: 'png' | 'jpeg' }
  filename?: string
}) => Promise<any>

type FakeServer = {
  tools: Map<string, { schema: unknown; handler: ToolHandler }>
  tool: (name: string, schema: unknown, handler: ToolHandler) => void
}

function createFakeServer(): FakeServer {
  const tools = new Map<string, { schema: unknown; handler: ToolHandler }>()
  return {
    tools,
    tool(name, schema, handler) {
      tools.set(name, { schema, handler })
    },
  }
}

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

test.group('MCP Storage Integration', () => {
  test('mcp html_to_pdf returns downloadUrl when storage is enabled', async ({ assert }) => {
    if (!env.get('PDF_STORAGE_ENABLED', false)) {
      return
    }

    const server = createFakeServer()
    registerPdfMcp(server as any)

    const tool = server.tools.get('html_to_pdf')
    assert.ok(tool)

    const result = await tool!.handler({
      html: '<html><body><h1>Hello PDF</h1></body></html>',
    })

    assert.equal(result.isError, undefined)

    const textItems = result.content.filter((item: any) => item.type === 'text')
    const downloadTextItem = textItems.find((item: any) => item.text.includes('/downloads/pdfs/'))
    assert.ok(downloadTextItem, 'Should include download URL in text content')

    // Should not include base64 resource when storage is enabled
    const resourceItems = result.content.filter((item: any) => item.type === 'resource')
    assert.lengthOf(resourceItems, 0)
  })

  test('mcp html_to_pdf omits downloadUrl when storage is disabled', async ({ assert }) => {
    if (env.get('PDF_STORAGE_ENABLED', false)) {
      return
    }

    const server = createFakeServer()
    registerPdfMcp(server as any)

    const tool = server.tools.get('html_to_pdf')
    assert.ok(tool)

    const result = await tool!.handler({
      html: '<html><body><h1>Hello PDF</h1></body></html>',
    })

    assert.equal(result.isError, undefined)

    // Should include base64 resource when storage is disabled
    const resourceItems = result.content.filter((item: any) => item.type === 'resource')
    assert.isAbove(resourceItems.length, 0)

    const textItems = result.content.filter((item: any) => item.type === 'text')
    const downloadTextItem = textItems.find((item: any) => item.text.includes('/downloads/pdfs/'))
    assert.isUndefined(downloadTextItem)
  })
})
