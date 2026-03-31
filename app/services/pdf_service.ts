import env from '#start/env'
import { DEFAULT_MAX_THUMBNAIL_PAGES, type HtmlToPdfFormat } from '#schemas/pdf_options'
import { pdf } from 'pdf-to-img'
import { chromium, type Browser } from 'playwright'
import sharp from 'sharp'

export type HtmlToPdfOptions = {
  format?: HtmlToPdfFormat
  width?: string | number
  height?: string | number
  landscape?: boolean
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
  printBackground?: boolean
  scale?: number
  preferCSSPageSize?: boolean
}

export type ThumbnailOptions = {
  enabled: boolean
  width?: number
  pages?: number[]
  format?: 'png' | 'jpeg'
}

export type Thumbnail = {
  page: number
  image: string
  width: number
  height: number
}

const UNSAFE_CHROMIUM_ARGS = new Set(['--no-sandbox', '--disable-setuid-sandbox'])

export function buildChromiumLaunchArgs(rawArgs: string[], disableSandbox: boolean): string[] {
  const args = disableSandbox ? rawArgs : rawArgs.filter((arg) => !UNSAFE_CHROMIUM_ARGS.has(arg))
  return [...new Set(args)]
}

export function selectThumbnailPages(
  totalPages: number,
  requestedPages: number[] | undefined,
  maxPages: number
): number[] {
  if (totalPages < 1 || maxPages < 1) {
    return []
  }

  if (!requestedPages || requestedPages.length === 0) {
    return Array.from({ length: Math.min(totalPages, maxPages) }, (_, i) => i + 1)
  }

  const selectedPages: number[] = []
  const seenPages = new Set<number>()

  for (const page of requestedPages) {
    if (page < 1 || page > totalPages || seenPages.has(page)) {
      continue
    }

    selectedPages.push(page)
    seenPages.add(page)

    if (selectedPages.length >= maxPages) {
      break
    }
  }

  return selectedPages
}

export class PdfService {
  private browser: Browser | null = null
  private launching: Promise<Browser> | null = null

  private parseArgs(): string[] {
    const raw = env.get('PDF_CHROMIUM_ARGS')
    if (!raw) {
      return []
    }

    return raw
      .split(' ')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  private async launchBrowser(): Promise<Browser> {
    const args = buildChromiumLaunchArgs(this.parseArgs(), env.get('PDF_DISABLE_SANDBOX', false))

    try {
      return await chromium.launch({
        args,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to launch Chromium. Ensure Playwright browsers are installed.'
      throw new Error(message)
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser
    }

    this.launching ??= this.launchBrowser()

    try {
      const browser = await this.launching
      this.browser = browser
      return browser
    } finally {
      this.launching = null
    }
  }

  async render(html: string, options: HtmlToPdfOptions) {
    const browser = await this.getBrowser()
    const page = await browser.newPage({
      viewport: {
        width: env.get('PDF_VIEWPORT_WIDTH'),
        height: env.get('PDF_VIEWPORT_HEIGHT'),
      },
    })

    page.setDefaultTimeout(env.get('PDF_TIMEOUT_MS'))
    page.setDefaultNavigationTimeout(env.get('PDF_NAVIGATION_TIMEOUT_MS'))

    try {
      if (!env.get('PDF_ALLOW_REMOTE')) {
        await page.route('**/*', (route) => {
          const url = route.request().url()
          const allowed =
            url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')
          return allowed ? route.continue() : route.abort()
        })
      }

      await page.setContent(html, { waitUntil: env.get('PDF_WAIT_UNTIL') })

      return await page.pdf({
        ...options,
        printBackground: options.printBackground ?? true,
        preferCSSPageSize: options.preferCSSPageSize ?? true,
      })
    } finally {
      await page.close()
    }
  }

  async generateThumbnails(pdfBuffer: Buffer, options: ThumbnailOptions): Promise<Thumbnail[]> {
    const thumbnails: Thumbnail[] = []
    const targetWidth = Math.min(options.width ?? 200, env.get('PDF_THUMBNAIL_MAX_WIDTH'))
    const format = options.format ?? 'png'
    const maxThumbnailPages = env.get('PDF_MAX_THUMBNAIL_PAGES', DEFAULT_MAX_THUMBNAIL_PAGES)

    const document = await pdf(pdfBuffer, { scale: 2 })
    const totalPages = document.length

    const pagesToProcess = selectThumbnailPages(totalPages, options.pages, maxThumbnailPages)

    for (const pageNum of pagesToProcess) {
      const pageImage = await document.getPage(pageNum)

      let sharpInstance = sharp(pageImage).resize({ width: targetWidth })

      if (format === 'jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: 85 })
      } else {
        sharpInstance = sharpInstance.png()
      }

      const { data: resizedBuffer, info } = await sharpInstance.toBuffer({
        resolveWithObject: true,
      })

      thumbnails.push({
        page: pageNum,
        image: resizedBuffer.toString('base64'),
        width: info.width,
        height: info.height,
      })
    }

    return thumbnails
  }

  async shutdown() {
    if (!this.browser) {
      return
    }

    await this.browser.close()
    this.browser = null
  }
}

const pdfService = new PdfService()

export default pdfService
