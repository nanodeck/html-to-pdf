import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, services } from '@adonisjs/drive'

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK', 'fs'),

  services: {
    fs: services.fs({
      location: app.makePath('storage'),
      serveFiles: true,
      routeBasePath: '/downloads',
      visibility: 'private',
      appUrl: env.get('APP_URL', ''),
    }),

    s3: services.s3({
      credentials: {
        accessKeyId: env.get('S3_ACCESS_KEY_ID', ''),
        secretAccessKey: env.get('S3_SECRET_ACCESS_KEY', ''),
      },
      region: env.get('S3_REGION', 'us-east-1'),
      bucket: env.get('S3_BUCKET', ''),
      endpoint: env.get('S3_ENDPOINT'),
      forcePathStyle: env.get('S3_FORCE_PATH_STYLE', false),
      visibility: 'private',
    }),

    gcs: services.gcs({
      credentials: {
        client_email: env.get('GCS_CLIENT_EMAIL', ''),
        private_key: env.get('GCS_PRIVATE_KEY', ''),
      },
      projectId: env.get('GCS_PROJECT_ID', ''),
      bucket: env.get('GCS_BUCKET', ''),
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
