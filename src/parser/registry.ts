import type { ParseModule } from './types.js'
import include from './directives/include.js'
import importDir from './directives/import.js'
import env from './directives/env.js'
import define from './directives/define.js'
import call from './directives/call.js'
import list from './directives/list.js'
import read from './directives/read.js'
import query from './directives/query.js'
import tree from './directives/tree.js'
import date from './directives/date.js'
import count from './directives/count.js'
import updateFrontmatter from './directives/update-frontmatter.js'
import readFrontmatter from './directives/read-frontmatter.js'
import test from './directives/test.js'
import check from './directives/check.js'
import hash from './directives/hash.js'
import foreach from './directives/foreach.js'
import setDir from './directives/set.js'
import switchDir from './directives/switch.js'
import render from './directives/render.js'
import ifDir from './directives/if.js'
import graph from './directives/graph.js'
import pipe from './directives/pipe.js'
import template from './directives/template.js'
import data from './directives/data.js'
import assert from './directives/assert.js'

const modules: ParseModule[] = [
  include, importDir, env, define, call,
  list, read, query, tree, date, count,
  updateFrontmatter, readFrontmatter, test, check, hash,
  foreach, setDir, switchDir,
  render, ifDir, graph, pipe,
  template, data, assert,
]

const registry = new Map<string, ParseModule>(
  modules.map(m => [m.name, m])
)

export function getModule(name: string): ParseModule | undefined {
  return registry.get(name)
}

export interface DirectiveInfo {
  name: string
}

export function getAvailableDirectives(): DirectiveInfo[] {
  return [...registry.values()]
    .map(m => ({ name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
