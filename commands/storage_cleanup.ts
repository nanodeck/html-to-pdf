import { BaseCommand, flags } from '@adonisjs/core/ace'
import { CommandOptions } from '@adonisjs/core/types/ace'
import { CleanupService } from '#services/cleanup_service'

export default class StorageCleanup extends BaseCommand {
  static readonly commandName = 'storage:cleanup'
  static readonly description = 'Delete expired PDF and thumbnail files from storage'

  static readonly options: CommandOptions = {
    startApp: true,
  }

  @flags.string({
    description: 'Retention period (e.g., 24h, 7d). Overrides PDF_STORAGE_RETENTION env var.',
    alias: 'r',
  })
  declare retention: string

  @flags.boolean({
    description: 'Preview what would be deleted without actually deleting',
    alias: 'd',
    default: false,
  })
  declare dryRun: boolean

  async run() {
    const { default: env } = await import('#start/env')
    const retention = this.retention || env.get('PDF_STORAGE_RETENTION', '24h')

    const service = new CleanupService(retention)

    this.logger.info(`Scanning for files older than ${retention}...`)

    const expired = await service.findExpiredPrefixes()

    if (expired.length === 0) {
      this.logger.success('No expired files found. Storage is clean.')
      return
    }

    if (this.dryRun) {
      this.logger.info(
        `[dry-run] Would delete ${expired.length} group${expired.length === 1 ? '' : 's'}:`
      )
      for (const entry of expired) {
        this.logger.info(`  ${entry.prefix} (last modified: ${entry.lastModified.toISOString()})`)
      }
      return
    }

    const deleted = await service.deletePrefixes(expired)
    this.logger.success(`Deleted ${deleted} expired group${deleted === 1 ? '' : 's'}.`)
  }
}
