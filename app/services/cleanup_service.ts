import drive from '@adonisjs/drive/services/main'
import logger from '@adonisjs/core/services/logger'

export type ExpiredPrefix = {
  prefix: string
  lastModified: Date
}

export class CleanupService {
  private readonly retentionMs: number

  constructor(retention: string) {
    this.retentionMs = this.parseRetention(retention)
  }

  async findExpiredPrefixes(): Promise<ExpiredPrefix[]> {
    const disk = drive.use()
    const expired: ExpiredPrefix[] = []
    const now = Date.now()

    const { objects } = await disk.listAll('pdfs/', { recursive: false })

    for (const obj of objects) {
      if (!obj.isDirectory) continue
      if (!('prefix' in obj)) continue

      const dirPrefix = obj.prefix
      const prefix = dirPrefix.endsWith('/') ? dirPrefix : `${dirPrefix}/`

      const { objects: filesIterable } = await disk.listAll(prefix, { recursive: true })
      const files = Array.from(filesIterable)

      if (files.length === 0) {
        expired.push({ prefix, lastModified: new Date(0) })
        continue
      }

      // All files in a prefix are written atomically by StorageService,
      // so checking any single file's lastModified is sufficient.
      const firstFile = files.find((f) => f.isFile)
      if (!firstFile) {
        expired.push({ prefix, lastModified: new Date(0) })
        continue
      }

      try {
        const meta = await disk.getMetaData(firstFile.key)
        if (now - meta.lastModified.getTime() >= this.retentionMs) {
          expired.push({ prefix, lastModified: meta.lastModified })
        }
      } catch (error) {
        logger.warn({ prefix, error }, 'Failed to read metadata for prefix, skipping')
      }
    }

    return expired
  }

  async deletePrefixes(prefixes: ExpiredPrefix[]): Promise<number> {
    const disk = drive.use()
    let deleted = 0

    for (const { prefix } of prefixes) {
      try {
        await disk.deleteAll(prefix)
        deleted++
      } catch (error) {
        logger.warn({ prefix, error }, 'Failed to delete prefix, skipping')
      }
    }

    return deleted
  }

  private parseRetention(retention: string): number {
    const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(retention)
    if (!match) {
      throw new Error(
        `Invalid retention format "${retention}". Use a number followed by ms, s, m, h, or d (e.g., "24h", "7d").`
      )
    }

    const value = Number.parseInt(match[1], 10)
    const unit = match[2]

    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    }

    return value * multipliers[unit]
  }
}
