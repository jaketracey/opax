// Secret binding names are part of the Worker contract. wrangler types cannot
// discover them in a checkout without .dev.vars; values stay out of the repo.
interface Env {
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
}
