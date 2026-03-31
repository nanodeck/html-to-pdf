export const pdfFormatValues = [
  'Letter',
  'Legal',
  'Tabloid',
  'Ledger',
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
] as const
export type HtmlToPdfFormat = (typeof pdfFormatValues)[number]

export const pdfThumbnailFormatValues = ['png', 'jpeg'] as const

export const pdfDimensionPattern = /^\d+(\.\d+)?(?:px|in|cm|mm)?$/i
export const pdfScaleMin = 0.1
export const pdfScaleMax = 2
export const DEFAULT_MAX_THUMBNAIL_PAGES = 10
export const DEFAULT_PDF_FILENAME = 'document.pdf'

export function isValidPdfDimension(value: string) {
  return pdfDimensionPattern.test(value)
}

export function sanitizePdfFilename(value: string) {
  const cleaned = value.replaceAll(/[^a-zA-Z0-9._-]/g, '_')
  if (cleaned.toLowerCase().endsWith('.pdf')) {
    return cleaned
  }
  return `${cleaned}.pdf`
}
