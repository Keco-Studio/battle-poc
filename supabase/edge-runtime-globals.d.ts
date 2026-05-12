/**
 * Minimal Deno globals for Supabase Edge Functions when checked with workspace TypeScript
 * (no Deno language server). Runtime is still Deno on deploy.
 */
declare namespace Deno {
  function serve(handler: (request: Request) => Response | Promise<Response>): void

  namespace env {
    function get(key: string): string | undefined
  }
}
