import { test } from '@japa/runner'
import assert from 'node:assert/strict'
import env from '#start/env'
import registerPdfMcp from '#mcp/html_to_pdf'

const storageEnabled = env.get('PDF_STORAGE_ENABLED', false)

type ThumbnailOptions = {
  enabled: boolean
  width?: number
  pages?: number[]
  format?: 'png' | 'jpeg'
}

type ToolHandler = (input: {
  html: string
  options?: unknown
  thumbnail?: ThumbnailOptions
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

test('mcp registers html_to_pdf tool', async () => {
  const server = createFakeServer()
  registerPdfMcp(server as any)

  const tool = server.tools.get('html_to_pdf')
  assert.ok(tool)
  assert.equal(typeof tool?.handler, 'function')
})

test('mcp html_to_pdf returns pdf resource payload', async () => {
  const server = createFakeServer()
  registerPdfMcp(server as any)

  const tool = server.tools.get('html_to_pdf')
  assert.ok(tool)

  const result = await tool!.handler({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    filename: 'My Report (final).pdf',
  })

  assert.equal(result.isError, undefined)
  assert.ok(Array.isArray(result.content))

  const textItem = result.content.find((item: any) => item.type === 'text')
  assert.ok(textItem)
  assert.match(textItem.text, /My_Report__final_\.pdf/i)

  if (storageEnabled) {
    const downloadTextItem = result.content.find(
      (item: any) => item.type === 'text' && item.text.includes('Download URL:')
    )
    assert.ok(downloadTextItem, 'Should include download URL text')
    assert.match(downloadTextItem.text, /\/downloads\/pdfs\//)
  } else {
    const resourceItem = result.content.find((item: any) => item.type === 'resource')
    assert.ok(resourceItem)

    const uri = resourceItem.resource?.uri ?? ''
    assert.match(String(uri), /^data:application\/pdf;base64,/)

    const base64 = String(uri).replace('data:application/pdf;base64,', '')
    const pdfBuffer = Buffer.from(base64, 'base64')
    assert.ok(pdfBuffer.subarray(0, 5).toString('utf8').startsWith('%PDF-'))
  }
})

test('mcp html_to_pdf enforces max html size', async () => {
  const server = createFakeServer()
  registerPdfMcp(server as any)

  const tool = server.tools.get('html_to_pdf')
  assert.ok(tool)

  const maxBytes = env.get('PDF_MAX_HTML_SIZE')
  const html = 'a'.repeat(maxBytes + 1)

  const result = await tool!.handler({ html })

  assert.equal(result.isError, true)
  const textItem = result.content?.[0]
  assert.ok(textItem)
  assert.match(String(textItem.text ?? ''), /HTML payload too large/i)
})

test('mcp html_to_pdf rejects invalid pdf options', async () => {
  const server = createFakeServer()
  registerPdfMcp(server as any)

  const tool = server.tools.get('html_to_pdf')
  assert.ok(tool)

  const result = await tool!.handler({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    options: {
      scale: 3,
      width: 'twelve',
    },
  })

  assert.equal(result.isError, true)
  assert.match(String(result.content?.[0]?.text ?? ''), /invalid|less than or equal/i)
})

test('mcp html_to_pdf rejects thumbnail page lists above the configured limit', async () => {
  const server = createFakeServer()
  registerPdfMcp(server as any)

  const tool = server.tools.get('html_to_pdf')
  assert.ok(tool)

  const maxThumbnailPages = env.get('PDF_MAX_THUMBNAIL_PAGES', 10)
  const result = await tool!.handler({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    thumbnail: {
      enabled: true,
      pages: Array.from({ length: maxThumbnailPages + 1 }, (_, index) => index + 1),
    },
  })

  assert.equal(result.isError, true)
  assert.match(String(result.content?.[0]?.text ?? ''), /at most|too_big|maximum/i)
})

test('mcp html_to_pdf returns thumbnails when enabled', async () => {
  const server = createFakeServer()
  registerPdfMcp(server as any)

  const tool = server.tools.get('html_to_pdf')
  assert.ok(tool)

  const result = await tool!.handler({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    thumbnail: {
      enabled: true,
      width: 100,
    },
  })

  assert.equal(result.isError, undefined)
  assert.ok(Array.isArray(result.content))

  if (storageEnabled) {
    const thumbTextItems = result.content.filter(
      (item: any) => item.type === 'text' && item.text.includes('Thumbnail page')
    )
    assert.ok(thumbTextItems.length >= 1, 'Should have at least one thumbnail URL')
  } else {
    const resourceItems = result.content.filter((item: any) => item.type === 'resource')
    assert.ok(resourceItems.length >= 2, 'Should have PDF and at least one thumbnail')

    const pdfResource = resourceItems[0]
    assert.match(String(pdfResource.resource?.uri ?? ''), /^data:application\/pdf;base64,/)

    const thumbnailResource = resourceItems[1]
    assert.match(String(thumbnailResource.resource?.uri ?? ''), /^data:image\/png;base64,/)
    assert.equal(thumbnailResource.resource?.mimeType, 'image/png')
  }
})

test('mcp html_to_pdf returns jpeg thumbnails when format is jpeg', async () => {
  const server = createFakeServer()
  registerPdfMcp(server as any)

  const tool = server.tools.get('html_to_pdf')
  assert.ok(tool)

  const result = await tool!.handler({
    html: '<html><body><h1>Hello PDF</h1></body></html>',
    thumbnail: {
      enabled: true,
      format: 'jpeg',
    },
  })

  assert.equal(result.isError, undefined)

  if (!storageEnabled) {
    const resourceItems = result.content.filter((item: any) => item.type === 'resource')
    const thumbnailResource = resourceItems[1]
    assert.match(String(thumbnailResource.resource?.uri ?? ''), /^data:image\/jpeg;base64,/)
    assert.equal(thumbnailResource.resource?.mimeType, 'image/jpeg')
  }
})
