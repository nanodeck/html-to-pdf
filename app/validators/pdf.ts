import vine from '@vinejs/vine'
import { pdfRequestSchema } from '#schemas/pdf'

export const createPdfValidator = vine.create(pdfRequestSchema)
