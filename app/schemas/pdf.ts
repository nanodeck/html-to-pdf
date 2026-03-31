import vine from '@vinejs/vine'
import { ApiProperty } from '@foadonis/openapi/decorators'
import env from '#start/env'
import {
  DEFAULT_MAX_THUMBNAIL_PAGES,
  isValidPdfDimension,
  pdfFormatValues,
  pdfScaleMax,
  pdfScaleMin,
  pdfThumbnailFormatValues,
} from '#schemas/pdf_options'

const maxThumbnailPages = env.get('PDF_MAX_THUMBNAIL_PAGES', DEFAULT_MAX_THUMBNAIL_PAGES)

const pdfDimensionRule = vine.createRule((value, _, field) => {
  if (typeof value !== 'string' || !isValidPdfDimension(value)) {
    field.report('The {{ field }} field must be a valid PDF size value', 'pdfDimension', field)
  }
})

const pdfDimension = vine.string().use(pdfDimensionRule())

export const pdfRequestSchema = vine.object({
  html: vine.string().trim().minLength(1),
  options: vine
    .object({
      format: vine.enum(pdfFormatValues).optional(),
      width: pdfDimension.optional(),
      height: pdfDimension.optional(),
      landscape: vine.boolean().optional(),
      margin: vine
        .object({
          top: pdfDimension.optional(),
          right: pdfDimension.optional(),
          bottom: pdfDimension.optional(),
          left: pdfDimension.optional(),
        })
        .optional(),
      printBackground: vine.boolean().optional(),
      scale: vine.number().min(pdfScaleMin).max(pdfScaleMax).optional(),
      preferCSSPageSize: vine.boolean().optional(),
    })
    .optional(),
  thumbnail: vine
    .object({
      enabled: vine.boolean(),
      width: vine.number().min(1).max(2000).optional(),
      pages: vine.array(vine.number().min(1)).maxLength(maxThumbnailPages).optional(),
      format: vine.enum(pdfThumbnailFormatValues).optional(),
    })
    .optional(),
  filename: vine.string().optional(),
})

export const pdfErrorSchema = vine.object({
  error: vine.string(),
  maxBytes: vine.number(),
  actualBytes: vine.number(),
})

export class PdfMargin {
  @ApiProperty({ required: false, type: String, example: '1cm' })
  declare top?: string

  @ApiProperty({ required: false, type: String, example: '1cm' })
  declare right?: string

  @ApiProperty({ required: false, type: String, example: '1cm' })
  declare bottom?: string

  @ApiProperty({ required: false, type: String, example: '1cm' })
  declare left?: string
}

export class PdfOptions {
  @ApiProperty({ required: false, type: String, enum: pdfFormatValues, example: 'A4' })
  declare format?: (typeof pdfFormatValues)[number]

  @ApiProperty({
    required: false,
    type: String,
    example: '8.27in',
    description: 'Size value using px, in, cm, or mm. Bare numbers are treated as px.',
  })
  declare width?: string

  @ApiProperty({
    required: false,
    type: String,
    example: '11.69in',
    description: 'Size value using px, in, cm, or mm. Bare numbers are treated as px.',
  })
  declare height?: string

  @ApiProperty({ required: false, type: Boolean, example: false })
  declare landscape?: boolean

  @ApiProperty({ required: false, type: PdfMargin })
  declare margin?: PdfMargin
  @ApiProperty({ required: false, type: Boolean, example: true })
  declare printBackground?: boolean

  @ApiProperty({
    required: false,
    type: Number,
    example: 1,
    minimum: pdfScaleMin,
    maximum: pdfScaleMax,
  })
  declare scale?: number

  @ApiProperty({ required: false, type: Boolean, example: true })
  declare preferCSSPageSize?: boolean
}

export class ThumbnailOptions {
  @ApiProperty({ type: Boolean, example: true, description: 'Enable thumbnail generation' })
  declare enabled: boolean

  @ApiProperty({
    required: false,
    type: Number,
    example: 200,
    description: 'Thumbnail width in pixels (height is proportional). Default: 200',
  })
  declare width?: number

  @ApiProperty({
    required: false,
    type: [Number],
    example: [1, 2],
    description: `Page numbers to generate thumbnails for. Default: the first ${maxThumbnailPages} pages.`,
  })
  declare pages?: number[]

  @ApiProperty({
    required: false,
    type: String,
    enum: pdfThumbnailFormatValues,
    example: 'png',
    description: 'Thumbnail image format. Default: png',
  })
  declare format?: (typeof pdfThumbnailFormatValues)[number]
}

export class Thumbnail {
  @ApiProperty({ type: Number, example: 1, description: 'Page number' })
  declare page: number

  @ApiProperty({ type: Number, example: 200, description: 'Thumbnail width in pixels' })
  declare width: number

  @ApiProperty({ type: Number, example: 283, description: 'Thumbnail height in pixels' })
  declare height: number

  @ApiProperty({
    required: false,
    type: String,
    description:
      'Base64-encoded thumbnail image (present when PDF_STORAGE_ENABLED is false or unset)',
  })
  declare data?: string

  @ApiProperty({
    required: false,
    type: String,
    example: '/downloads/pdfs/abc-123/thumbnails/page-1.png?signature=...',
    description: 'Signed download URL for the thumbnail (present when PDF_STORAGE_ENABLED=true)',
  })
  declare downloadUrl?: string
}

export class PdfResponse {
  @ApiProperty({ type: String, example: 'document.pdf', description: 'Filename' })
  declare filename: string

  @ApiProperty({
    required: false,
    type: String,
    description: 'Base64-encoded PDF content (present when PDF_STORAGE_ENABLED is false or unset)',
  })
  declare data?: string

  @ApiProperty({
    required: false,
    type: String,
    example: '/downloads/pdfs/abc-123/document.pdf?signature=...',
    description: 'Signed download URL for the PDF (present when PDF_STORAGE_ENABLED=true)',
  })
  declare downloadUrl?: string

  @ApiProperty({
    type: [Thumbnail],
    description: 'Array of generated thumbnails (empty array if thumbnails not enabled)',
  })
  declare thumbnails: Thumbnail[]
}

export class CreatePdfRequest {
  @ApiProperty({ type: String, example: '<html><body><h1>Hello PDF</h1></body></html>' })
  declare html: string

  @ApiProperty({ required: false, type: PdfOptions })
  declare options?: PdfOptions
  @ApiProperty({ required: false, type: ThumbnailOptions })
  declare thumbnail?: ThumbnailOptions
  @ApiProperty({ required: false, type: String, example: 'document.pdf' })
  declare filename?: string
}

export class PdfErrorResponse {
  @ApiProperty({ type: String, example: 'HTML payload too large' })
  declare error: string

  @ApiProperty({ type: Number, example: 2097152 })
  declare maxBytes: number

  @ApiProperty({ type: Number, example: 2098000 })
  declare actualBytes: number
}

export class PdfValidationIssue {
  @ApiProperty({ type: String, example: 'options.scale' })
  declare field: string

  @ApiProperty({ type: String, example: 'max' })
  declare rule: string

  @ApiProperty({ type: String, example: 'The scale field must not be greater than 2' })
  declare message: string
}

export class PdfValidationErrorResponse {
  @ApiProperty({ type: [PdfValidationIssue] })
  declare errors: PdfValidationIssue[]
}
