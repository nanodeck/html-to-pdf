import app from '@adonisjs/core/services/app'
import pdfService from '#services/pdf_service'

app.terminating(async () => {
  await pdfService.shutdown()
})
