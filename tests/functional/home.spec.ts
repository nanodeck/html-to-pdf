import { test } from '@japa/runner'

test('home page renders landing content', async ({ client }) => {
  const response = await client.get('/')

  response.assertStatus(200)
  response.assertTextIncludes('HTML')
  response.assertTextIncludes('PDF')
  response.assertTextIncludes('Docs')
})
