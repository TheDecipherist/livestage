export interface ASTNodeBase {
  type: string
  line: number
}

export interface CacheConfig {
  mode: 'session' | 'persist' | 'mock'
  ttl?: number
  mockPath?: string
}

export interface InterpolationSpan {
  start: number
  end: number
  expression: string
  escaped: boolean
}

export interface ShellInlineSpan {
  start: number
  end: number
  command: string
}

export interface IncludeNode extends ASTNodeBase {
  type: 'include'
  path: string
  condition: string | null
  local: boolean
  cache: CacheConfig | null
}

export interface ImportNode extends ASTNodeBase {
  type: 'import'
  path: string
  condition: string | null
  local: boolean
  cache: CacheConfig | null
}

export interface EnvNode extends ASTNodeBase {
  type: 'env'
  name: string
  fallback: string | null
}

export interface DefineNode extends ASTNodeBase {
  type: 'define'
  name: string
  params: string[]
  local: boolean
  body: ASTNode[]
  transitions: TransitionNode[]
}

export interface CallNode extends ASTNodeBase {
  type: 'call'
  name: string
  args: Record<string, string>
  positionalArgs: string[]
}

export type TransitionAction =
  | { type: 'macro'; name: string; args: Record<string, string> }
  | { type: 'halt' }
  | { type: 'next' }

export interface TransitionNode extends ASTNodeBase {
  type: 'transition'
  event: 'complete'
  action: TransitionAction
}

export interface ListNode extends ASTNodeBase {
  type: 'list'
  path: string
  args: Record<string, string>
  cache: CacheConfig | null
}

export interface ReadNode extends ASTNodeBase {
  type: 'read'
  path: string
  args: Record<string, string>
  cache: CacheConfig | null
}

export interface QueryNode extends ASTNodeBase {
  type: 'query'
  command: string
  args: Record<string, string>
  cache: CacheConfig | null
}

export interface TreeNode extends ASTNodeBase {
  type: 'tree'
  path: string
  args: Record<string, string>
  cache: CacheConfig | null
}

export interface DateNode extends ASTNodeBase {
  type: 'date'
  args: Record<string, string>
}

export interface CountNode extends ASTNodeBase {
  type: 'count'
  path: string
  args: Record<string, string>
}

export interface UpdateFrontmatterNode extends ASTNodeBase {
  type: 'update-frontmatter'
  path: string
  field: string
  value: string
  args: Record<string, string>
}

export interface ReadFrontmatterNode extends ASTNodeBase {
  type: 'read-frontmatter'
  path: string
  field: string
  args: Record<string, string>  // optional: label=
}

export interface TestNode extends ASTNodeBase {
  type: 'test'
  command: string | null
  args: Record<string, string>  // optional: command=, label=, budget=
}

export interface CheckNode extends ASTNodeBase {
  type: 'check'
  command: string | null
  args: Record<string, string>  // optional: command=, label=, budget=
}

export interface HashNode extends ASTNodeBase {
  type: 'hash'
  path: string
  args: Record<string, string>  // optional: algo=, length=, exclude-line=, label=
}

export interface ForeachNode extends ASTNodeBase {
  type: 'foreach'
  varName: string           // identifier bound to each item inside the body
  source: ASTNode | null    // a directive node whose output is the list (list / read / read-frontmatter / query)
  literalSource: string | null  // raw "{{ label }}" or comma list when no directive node was parseable
  body: ASTNode[]
  args: Record<string, string>
}

export interface SetNode extends ASTNodeBase {
  type: 'set'
  varName: string           // identifier to bind
  source: ASTNode | null    // a directive node whose output becomes the value
  literalExpr: string | null  // raw expression for arithmetic / interpolation
  args: Record<string, string>
}

export interface RenderNode extends ASTNodeBase {
  type: 'render'
  args: Record<string, string>
}

export interface ConditionalBranch {
  condition: string | null
  body: ASTNode[]
}

export interface ConditionalNode extends ASTNodeBase {
  type: 'conditional'
  branches: ConditionalBranch[]
}

export interface SwitchCase {
  caseExpression: string
  body: ASTNode[]
}

export interface SwitchNode extends ASTNodeBase {
  type: 'switch'
  expression: string
  cases: SwitchCase[]
  defaultBody: ASTNode[] | null
}

export type PipeStage =
  | { type: 'source'; node: ASTNode }
  | { type: 'builtin'; command: string }
  | { type: 'shell'; command: string }
  | { type: 'sink'; node: RenderNode }
  | { type: 'scalar' }

export interface PipeNode extends ASTNodeBase {
  type: 'pipe'
  stages: PipeStage[]
}

export interface GraphNode extends ASTNodeBase {
  type: 'graph'
  target: string          // glob of documents to include as nodes
  relation: string        // frontmatter field read as the edge list, e.g. depends_on
  idField: string         // frontmatter field used as each doc's node id
  format: 'tree' | 'table' | 'mermaid'
  label: string | null
}

export interface MarkdownNode extends ASTNodeBase {
  type: 'markdown'
  text: string
  interpolations: InterpolationSpan[]
  shellInlines: ShellInlineSpan[]
}

export interface PassthroughNode extends ASTNodeBase {
  type: 'passthrough'
  raw: string
}

export interface InterpolationNode extends ASTNodeBase {
  type: 'interpolation'
  expression: string
  escaped: boolean
}

export interface TemplateNode extends ASTNodeBase {
  type: 'template'
  path: string
  dataExpr: string | null
  asName: string
  condition: string | null
  cache: CacheConfig | null
}

export interface DataAssignEntry {
  kind: 'assign'
  key: string[]
  rhs: string
  line: number
}

export interface DataSpreadEntry {
  kind: 'spread'
  rhs: string
  line: number
}

export type DataEntry = DataAssignEntry | DataSpreadEntry

export interface DataNode extends ASTNodeBase {
  type: 'data'
  name: string
  entries: DataEntry[]
}

export interface CodeNode extends ASTNodeBase {
  type: 'code'
  language: string          // explicit language=, or inferred from src's extension; parse() throws if neither resolves
  src: string | null        // external script file, mutually exclusive with an inline body
  body: string | null       // inline script text (block form), verbatim, never parsed as directives
  label: string | null
  timeout: number | null    // ms override of policy's code.timeout
  interpolate: boolean      // default false: {{ }} inside the body is opt-in
  args: Record<string, string>
  cache: CacheConfig | null // mock= populates { mode: 'mock', mockPath }, feature 35
}

export interface AssertNode extends ASTNodeBase {
  type: 'assert'
  operator: string           // file-exists | contains | some-contains | contains-if-present | absent | json-key
  target: string             // glob resolved relative to the document's data root
  pattern: string | null     // contains-class operators
  key: string | null         // json-key
  equals: string | null      // json-key, optional value check
  label: string | null
  args: Record<string, string>
}

export type ASTNode =
  | IncludeNode
  | ImportNode
  | EnvNode
  | DefineNode
  | CallNode
  | TransitionNode
  | ListNode
  | ReadNode
  | QueryNode
  | TreeNode
  | DateNode
  | CountNode
  | UpdateFrontmatterNode
  | ReadFrontmatterNode
  | TestNode
  | CheckNode
  | HashNode
  | ForeachNode
  | SetNode
  | RenderNode
  | ConditionalNode
  | SwitchNode
  | PipeNode
  | GraphNode
  | MarkdownNode
  | PassthroughNode
  | TemplateNode
  | DataNode
  | AssertNode
  | CodeNode

export interface ParseResult {
  isLiveStage: boolean
  version: string | null
  nodes: ASTNode[]
}

export interface ParseOptions {
  filePath?: string
  inImport?: boolean
}

export interface ParseContext {
  line: number
  filePath: string
  inImport: boolean
}

/**
 * v2.0 DirectiveInput, what each directive's parse() now receives.
 *
 * The parser pre-tokenizes the opener line + continuation lines into:
 *   - positional: the first whitespace-separated argument on the opener line
 *     after the directive name (everything up to the first key=value attr or
 *     the trailing `/` self-close marker). Empty string if absent.
 *   - attrs: key=value attributes from the opener line AND from continuation
 *     attr-lines (Form 2/3). Keys are lowercased verbatim from source.
 *   - flags: bare-name tokens (no `=`), collected from both opener and
 *     continuation lines.
 *   - body: raw body lines (no leading indent stripped, directives that need
 *     them do their own stripping). Empty array for Form 1 / Form 2.
 *   - isSelfClosed: true when the opener line ended with ` /` (Form 1).
 *   - line: 1-based line number of the opener.
 *
 * `rawArgs` is the verbatim text after the directive name on the opener line,
 * stripped of the trailing self-close ` /`. Directives that need to parse
 * non-trivial positional/expression syntax (e.g. @if condition, @foreach
 * "x in source", @set "v = expr") read it directly instead of using the
 * pre-split positional/attrs.
 */
export interface DirectiveInput {
  positional: string
  attrs: Record<string, string>
  flags: string[]
  body: string[]
  isSelfClosed: boolean
  line: number
  rawArgs: string
}

export interface ParseModule {
  name: string
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly sourceLine: number,
    public readonly filePath: string
  ) {
    super(`[${filePath}:${sourceLine}] ${message}`)
    this.name = 'ParseError'
  }
}
