/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { throttle } from '#start/limiter'
import app from '@adonisjs/core/services/app'
import router from '@adonisjs/core/services/router'
import openapi from '@foadonis/openapi/services/main'

openapi.registerRoutes()

if (app.getEnvironment() === 'web') {
  const [{ default: mcp }, { default: registerPdfMcp }] = await Promise.all([
    import('@7nohe/adonis-mcp/services/main'),
    import('#mcp/html_to_pdf'),
  ])

  await mcp.registerRoutes(registerPdfMcp, (route) => {
    route.use(throttle)
  })
}

router.get('/', [() => import('#controllers/home_controller'), 'show'])
router.get('/health', [() => import('#controllers/health_controller'), 'show'])
router.post('/api/pdf', [() => import('#controllers/pdf_controller'), 'create']).use(throttle)
