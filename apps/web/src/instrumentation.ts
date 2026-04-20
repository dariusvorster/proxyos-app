export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  await import(/* webpackIgnore: true */ './instrumentation.node.js')
}
