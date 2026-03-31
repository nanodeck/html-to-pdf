import PdfController from '#controllers/pdf_controller'
import { defineConfig } from '@foadonis/openapi'

export default defineConfig({
  ui: 'scalar',
  document: {
    info: {
      title: 'HTML to PDF API',
      version: '1.0.0',
      description: 'Generate PDFs from HTML.',
    },
  },
  controllers: [PdfController],
})
