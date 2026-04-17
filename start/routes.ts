/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { throttle } from '#start/limiter'
import router from '@adonisjs/core/services/router'
import openapi from '@foadonis/openapi/services/main'

openapi.registerRoutes()

router.get('/', [() => import('#controllers/home_controller'), 'show'])
router.get('/health', [() => import('#controllers/health_controller'), 'show'])
router.post('/api/pdf', [() => import('#controllers/pdf_controller'), 'create']).use(throttle)
