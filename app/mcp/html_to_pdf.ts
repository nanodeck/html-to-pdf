import env from '#start/env'
import pdfService, { type ThumbnailOptions } from '#services/pdf_service'
import {
  DEFAULT_MAX_THUMBNAIL_PAGES,
  DEFAULT_PDF_FILENAME,
  pdfDimensionPattern,
  pdfFormatValues,
  pdfScaleMax,
  pdfScaleMin,
  pdfThumbnailFormatValues,
  sanitizePdfFilename,
} from '#schemas/pdf_options'
import logger from '@adonisjs/core/services/logger'
import { StorageService } from '#services/storage_service'
import { z } from 'zod'

const maxThumbnailPages = env.get('PDF_MAX_THUMBNAIL_PAGES', DEFAULT_MAX_THUMBNAIL_PAGES)
const pdfDimensionSchema = z.union([z.string().regex(pdfDimensionPattern), z.number().positive()])

const requestSchema = z.object({
  html: z.string().trim().min(1),
  options: z
    .object({
      format: z.enum(pdfFormatValues).optional(),
      width: pdfDimensionSchema.optional(),
      height: pdfDimensionSchema.optional(),
      landscape: z.boolean().optional(),
      margin: z
        .object({
          top: pdfDimensionSchema.optional(),
          right: pdfDimensionSchema.optional(),
          bottom: pdfDimensionSchema.optional(),
          left: pdfDimensionSchema.optional(),
        })
        .optional(),
      printBackground: z.boolean().optional(),
      scale: z.number().min(pdfScaleMin).max(pdfScaleMax).optional(),
      preferCSSPageSize: z.boolean().optional(),
    })
    .optional(),
  thumbnail: z
    .object({
      enabled: z.boolean(),
      width: z.number().min(1).max(2000).optional(),
      pages: z.array(z.number().min(1)).max(maxThumbnailPages).optional(),
      format: z.enum(pdfThumbnailFormatValues).optional(),
    })
    .optional(),
  filename: z.string().optional(),
})

type McpContent = { type: string; text?: string; resource?: Record<string, unknown> }
type McpResult = { isError?: boolean; content: McpContent[] }

function mcpError(text: string): McpResult {
  return { isError: true, content: [{ type: 'text', text }] }
}

async function generateThumbnails(
  pdfBuffer: Buffer,
  thumbnail: ThumbnailOptions | undefined
): Promise<import('#services/pdf_service').Thumbnail[]> {
  if (!thumbnail?.enabled) return []
  try {
    const thumbnails = await pdfService.generateThumbnails(pdfBuffer, thumbnail)
    logger.debug({ thumbnailCount: thumbnails.length }, 'mcp:html_to_pdf thumbnails generated')
    return thumbnails
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate thumbnails'
    logger.info({ err: error, message }, 'mcp:html_to_pdf thumbnail generation failed')
    return []
  }
}

function buildStorageContent(
  safeFilename: string,
  storageResult: import('#services/storage_service').StorageResult
): McpContent[] {
  const content: McpContent[] = [
    { type: 'text', text: `PDF generated: ${safeFilename}` },
    { type: 'text', text: `Download URL: ${storageResult.downloadUrl}` },
  ]
  for (const thumbUrl of storageResult.thumbnailDownloadUrls) {
    content.push({ type: 'text', text: `Thumbnail page ${thumbUrl.page}: ${thumbUrl.downloadUrl}` })
  }
  return content
}

function buildInlineContent(
  safeFilename: string,
  pdfBuffer: Buffer,
  thumbnails: import('#services/pdf_service').Thumbnail[],
  thumbnailFormat: string | undefined
): McpContent[] {
  const base64Pdf = pdfBuffer.toString('base64')
  const content: McpContent[] = [
    { type: 'text', text: `PDF generated: ${safeFilename}` },
    {
      type: 'resource',
      resource: {
        uri: `data:application/pdf;base64,${base64Pdf}`,
        blob: base64Pdf,
        mimeType: 'application/pdf',
      },
    },
  ]
  for (const thumb of thumbnails) {
    const mimeType = thumbnailFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
    content.push({
      type: 'resource',
      resource: {
        uri: `data:${mimeType};base64,${thumb.image}`,
        blob: thumb.image,
        mimeType,
        text: `Thumbnail page ${thumb.page} (${thumb.width}x${thumb.height})`,
      },
    })
  }
  return content
}

export default function registerPdfMcp(server: any) {
  server.tool(
    'html_to_pdf',
    {
      html: requestSchema.shape.html,
      options: requestSchema.shape.options,
      thumbnail: requestSchema.shape.thumbnail,
      filename: requestSchema.shape.filename,
    },
    async (input: z.input<typeof requestSchema>): Promise<McpResult> => {
      const parsedInput = requestSchema.safeParse(input)
      if (!parsedInput.success) {
        return mcpError(parsedInput.error.issues.map((issue) => issue.message).join('; '))
      }

      const { html, options, thumbnail, filename } = parsedInput.data
      const maxBytes = env.get('PDF_MAX_HTML_SIZE')
      const htmlBytes = Buffer.byteLength(html, 'utf8')
      const startedAt = Date.now()

      logger.info('mcp:html_to_pdf request received')
      logger.debug(
        {
          htmlBytes,
          maxBytes,
          filename: filename ?? DEFAULT_PDF_FILENAME,
          hasOptions: Boolean(options),
          hasThumbnail: Boolean(thumbnail?.enabled),
        },
        'mcp:html_to_pdf request details'
      )

      if (htmlBytes > maxBytes) {
        logger.info({ htmlBytes, maxBytes }, 'mcp:html_to_pdf payload too large')
        return mcpError(
          `HTML payload too large. Max bytes: ${maxBytes}. Actual bytes: ${htmlBytes}.`
        )
      }

      try {
        const pdfBuffer = await pdfService.render(html, (options as any) ?? {})
        const safeFilename = sanitizePdfFilename(filename ?? DEFAULT_PDF_FILENAME)
        const generatedThumbnails = await generateThumbnails(
          pdfBuffer,
          thumbnail as ThumbnailOptions | undefined
        )

        let content: McpContent[]
        if (env.get('PDF_STORAGE_ENABLED', false)) {
          const storageService = new StorageService(env.get('PDF_STORAGE_EXPIRY', '1h'))
          const storageResult = await storageService.storeResult(
            pdfBuffer,
            safeFilename,
            generatedThumbnails
          )
          content = buildStorageContent(safeFilename, storageResult)
        } else {
          content = buildInlineContent(
            safeFilename,
            pdfBuffer,
            generatedThumbnails,
            thumbnail?.format
          )
        }

        logger.info(
          { durationMs: Date.now() - startedAt, pdfBytes: pdfBuffer.length },
          'mcp:html_to_pdf request completed'
        )
        logger.debug({ filename: safeFilename }, 'mcp:html_to_pdf response prepared')

        return { content }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to render PDF'
        logger.info({ err: error, message }, 'mcp:html_to_pdf render failed')
        return mcpError(message)
      }
    }
  )
}
