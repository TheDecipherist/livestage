// cl100k_base token counting, the tokenizer Part 3 of the delivery report
// specifies ("pure tokenization... needs neither" a live agent loop nor
// single model calls beyond phase 1b). Uses js-tiktoken (a pure-JS port of
// OpenAI's tiktoken, no native build step) rather than shelling out to
// Python's tiktoken, which the original run used: this harness has to be
// runnable by "someone who only has the repo", and this project has no
// other reason to require Python.
import { getEncoding } from 'js-tiktoken'

let encoder = null

function enc() {
  if (!encoder) encoder = getEncoding('cl100k_base')
  return encoder
}

export function countTokens(text) {
  return enc().encode(text).length
}
