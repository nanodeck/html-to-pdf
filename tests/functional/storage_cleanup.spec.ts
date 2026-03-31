import { test } from '@japa/runner'
import drive from '@adonisjs/drive/services/main'
import ace from '@adonisjs/core/services/ace'

test.group('storage:cleanup command', (group) => {
  group.each.setup(async () => {
    const disk = drive.use()
    await disk.deleteAll('pdfs/')
  })

  test('deletes expired files', async ({ assert }) => {
    const disk = drive.use()

    // Create files via Drive (they'll have "now" as lastModified)
    await disk.put('pdfs/uuid-1/doc.pdf', 'fake', { contentType: 'application/pdf' })
    await disk.put('pdfs/uuid-1/thumbnails/page-1.png', 'fake', { contentType: 'image/png' })
    await disk.put('pdfs/uuid-2/doc.pdf', 'fake', { contentType: 'application/pdf' })

    // With 7d retention, nothing should be deleted (files are fresh)
    const command1 = await ace.exec('storage:cleanup', ['--retention=7d'])
    assert.equal(command1.exitCode, 0)
    assert.isTrue(await disk.exists('pdfs/uuid-1/doc.pdf'))
    assert.isTrue(await disk.exists('pdfs/uuid-2/doc.pdf'))

    // With 1ms retention, everything should be deleted
    const command2 = await ace.exec('storage:cleanup', ['--retention=1ms'])
    assert.equal(command2.exitCode, 0)
    assert.isFalse(await disk.exists('pdfs/uuid-1/doc.pdf'))
    assert.isFalse(await disk.exists('pdfs/uuid-1/thumbnails/page-1.png'))
    assert.isFalse(await disk.exists('pdfs/uuid-2/doc.pdf'))
  })

  test('dry-run does not delete anything', async ({ assert }) => {
    const disk = drive.use()

    await disk.put('pdfs/uuid-dry/doc.pdf', 'fake', { contentType: 'application/pdf' })

    // Wait so the file is older than 1ms retention
    await new Promise((resolve) => setTimeout(resolve, 10))

    const command = await ace.exec('storage:cleanup', ['--retention=1ms', '--dry-run'])
    assert.equal(command.exitCode, 0)

    // File should still exist despite being expired — dry-run prevents deletion
    assert.isTrue(await disk.exists('pdfs/uuid-dry/doc.pdf'))
  })

  test('reports clean when no files exist', async ({ assert }) => {
    const command = await ace.exec('storage:cleanup', ['--retention=24h'])
    assert.equal(command.exitCode, 0)
  })
})
