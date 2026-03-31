let defineConfig: (config: any) => any

try {
  ;({ defineConfig } = await import('@7nohe/adonis-mcp'))
} catch {
  defineConfig = (config) => config
}

export default defineConfig({
  path: '/mcp',
  serverOptions: {
    name: 'html-to-pdf',
    version: '0.0.0',
  },
})
