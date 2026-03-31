import { randomUUID } from 'node:crypto'
import drive from '@adonisjs/drive/services/main'
import type { Thumbnail } from '#services/pdf_service'

export type StorageResult = {
  downloadUrl: string
  thumbnailDownloadUrls: { page: number; downloadUrl: string }[]
}

export class StorageService {
  constructor(private readonly expiry: string) {}

  async storeResult(
    pdfBuffer: Buffer,
    filename: string,
    thumbnails: Thumbnail[]
  ): Promise<StorageResult> {
    const id = randomUUID()
    const disk = drive.use()

    const pdfKey = `pdfs/${id}/${filename}`
    await disk.put(pdfKey, pdfBuffer, { contentType: 'application/pdf' })

    const downloadUrl = await disk.getSignedUrl(pdfKey, {
      expiresIn: this.expiry,
      contentDisposition: `attachment; filename="${filename}"`,
    })

    const thumbnailDownloadUrls: StorageResult['thumbnailDownloadUrls'] = []

    for (const thumb of thumbnails) {
      const ext = thumb.image.startsWith('/9j/') ? 'jpg' : 'png'
      const mimeType = ext === 'jpg' ? 'image/jpeg' : 'image/png'
      const thumbKey = `pdfs/${id}/thumbnails/page-${thumb.page}.${ext}`
      const thumbBuffer = Buffer.from(thumb.image, 'base64')

      await disk.put(thumbKey, thumbBuffer, { contentType: mimeType })

      const thumbUrl = await disk.getSignedUrl(thumbKey, {
        expiresIn: this.expiry,
      })

      thumbnailDownloadUrls.push({ page: thumb.page, downloadUrl: thumbUrl })
    }

    return { downloadUrl, thumbnailDownloadUrls }
  }
}
