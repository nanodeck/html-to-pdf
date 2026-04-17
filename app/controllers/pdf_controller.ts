import type { HttpContext, HttpResponse } from '@adonisjs/core/http'
import type { Logger } from '@adonisjs/core/logger'
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@foadonis/openapi/decorators'
import env from '#start/env'
import pdfService from '#services/pdf_service'
import type { Thumbnail, ThumbnailOptions } from '#services/pdf_service'
import {
  CreatePdfRequest,
  PdfErrorResponse,
  PdfResponse,
  PdfValidationErrorResponse,
} from '#schemas/pdf'
import { DEFAULT_PDF_FILENAME, sanitizePdfFilename } from '#schemas/pdf_options'
import { createPdfValidator } from '#validators/pdf'
import { StorageService, type StorageResult } from '#services/storage_service'

export default class PdfController {
  @ApiTags('PDF')
  @ApiOperation({
    summary: 'Generate a PDF',
    description: 'Render HTML into a PDF using a headless Chromium instance.',
  })
  @ApiBody({
    description: 'HTML payload',
    type: CreatePdfRequest,
  })
  @ApiResponse({
    status: 200,
    description: 'PDF generation result',
    type: PdfResponse,
  })
  @ApiResponse({
    status: 422,
    description: 'Validation error',
    type: PdfValidationErrorResponse,
  })
  @ApiResponse({
    status: 413,
    description: 'Payload too large',
    type: PdfErrorResponse,
  })
  async create({ request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(createPdfValidator)
    const html = payload.html

    const maxBytes = env.get('PDF_MAX_HTML_SIZE')
    const htmlBytes = Buffer.byteLength(html, 'utf8')
    const startedAt = Date.now()

    logger.info('pdf:request received')
    logger.debug(
      {
        htmlBytes,
        maxBytes,
        filename: payload.filename ?? DEFAULT_PDF_FILENAME,
        hasOptions: Boolean(payload.options),
        hasThumbnail: Boolean(payload.thumbnail?.enabled),
      },
      'pdf:request details'
    )

    // Intentional byte-length check (not char-length): multi-byte UTF-8 chars
    // make byte size differ from string length, and the limit is about payload size.
    if (htmlBytes > maxBytes) {
      logger.info({ htmlBytes, maxBytes }, 'pdf:payload too large')
      return response.status(413).send({
        error: 'HTML payload too large',
        maxBytes,
        actualBytes: htmlBytes,
      })
    }

    const pdfBuffer = await this.renderPdf(html, payload.options ?? {}, response, logger)
    if (!pdfBuffer) return

    const filename = sanitizePdfFilename(payload.filename ?? DEFAULT_PDF_FILENAME)

    const thumbnails = await this.renderThumbnails(pdfBuffer, payload.thumbnail, response, logger)
    if (!thumbnails) return

    const storageResult = await this.storePdf(pdfBuffer, filename, thumbnails, response, logger)
    if (storageResult === false) return

    logger.info(
      { durationMs: Date.now() - startedAt, pdfBytes: pdfBuffer.length },
      'pdf:request completed'
    )

    return response.send(this.buildResponse(filename, pdfBuffer, thumbnails, storageResult))
  }

  private async renderPdf(
    html: string,
    options: Record<string, unknown>,
    response: HttpResponse,
    logger: Logger
  ): Promise<Buffer | null> {
    try {
      return await pdfService.render(html, options)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to render PDF'
      logger.info({ err: error, message }, 'pdf:render failed')
      response.status(500).send({ error: message })
      return null
    }
  }

  private async renderThumbnails(
    pdfBuffer: Buffer,
    thumbnailOptions: ThumbnailOptions | undefined,
    response: HttpResponse,
    logger: Logger
  ): Promise<Thumbnail[] | null> {
    if (!thumbnailOptions?.enabled) {
      return []
    }
    try {
      const thumbnails = await pdfService.generateThumbnails(pdfBuffer, thumbnailOptions)
      logger.debug({ thumbnailCount: thumbnails.length }, 'pdf:thumbnails generated')
      return thumbnails
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate thumbnails'
      logger.info({ err: error, message }, 'pdf:thumbnail generation failed')
      response.status(500).send({ error: message })
      return null
    }
  }

  private async storePdf(
    pdfBuffer: Buffer,
    filename: string,
    thumbnails: Thumbnail[],
    response: HttpResponse,
    logger: Logger
  ): Promise<StorageResult | null | false> {
    if (!env.get('PDF_STORAGE_ENABLED', false)) {
      return null
    }
    try {
      const storageService = new StorageService(env.get('PDF_STORAGE_EXPIRY', '1h'))
      return await storageService.storeResult(pdfBuffer, filename, thumbnails)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to store PDF'
      logger.error({ err: error, message }, 'pdf:storage failed')
      response.status(500).send({ error: message })
      return false
    }
  }

  private buildResponse(
    filename: string,
    pdfBuffer: Buffer,
    thumbnails: Thumbnail[],
    storageResult: StorageResult | null
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { filename }

    if (storageResult) {
      result.downloadUrl = storageResult.downloadUrl
    } else {
      result.data = pdfBuffer.toString('base64')
    }

    result.thumbnails = thumbnails.map((thumb) => {
      const thumbResult: Record<string, unknown> = {
        page: thumb.page,
        width: thumb.width,
        height: thumb.height,
      }
      if (storageResult) {
        const thumbUrl = storageResult.thumbnailDownloadUrls.find((t) => t.page === thumb.page)
        if (thumbUrl) {
          thumbResult.downloadUrl = thumbUrl.downloadUrl
        }
      } else {
        thumbResult.data = thumb.image
      }
      return thumbResult
    })

    return result
  }
}
