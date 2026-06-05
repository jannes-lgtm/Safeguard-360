#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '../src')
const SKIP = new Set(['node_modules', '.git', 'dist', 'build'])

const VIOLATIONS = [
  { re: /#0118[Aa]1/g,           label: 'hardcoded brand blue' },
  { re: /#EEF1FF/g,              label: 'light brand-blue tint' },
  { re: /#FFF7ED/g,              label: 'light amber bg' },
  { re: /#F0FDF4/g,              label: 'light green bg' },
  { re: /#EFF6FF/g,              label: 'light blue bg' },
  { re: /background:\s*['"]#?[Ff]{3,6}['"]/g, label: 'white bg inline' },
  { re: /background:\s*['"]white['"]/gi, label: "background:'white'" },
  { re: /bg-white\b/g,           label: 'tailwind bg-white' },
  { re: /bg-red-50\b/g,          label: 'tailwind bg-red-50' },
  { re: /bg-green-50\b/g,        label: 'tailwind bg-green-50' },
  { re: /bg-amber-50\b/g,        label: 'tailwind bg-amber-50' },
  { re: /bg-red-100\b/g,         label: 'tailwind bg-red-100' },
  { re: /bg-green-100\b/g,       label: 'tailwind bg-green-100' },
  { re: /#1E2461/g,              label: 'hardcoded navy' },
  { re: /#2563EB/g,              label: 'hardcoded blue' },
  { re: /#D97706/g,              label: 'hardcoded amber' },
  { re: /text-\[#0118/g,         label: 'tailwind text-[#0118...]' },
]

let total = 0
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { walk(full); continue }
    if (!/\.(jsx?|tsx?)$/.test(e.name)) continue
    const src = fs.readFileSync(full, 'utf8')
    const lines = src.split('\n')
    const rel = path.relative(ROOT, full)
    for (const { re, label } of VIOLATIONS) {
      re.lastIndex = 0
      lines.forEach((line, i) => {
        re.lastIndex = 0
        if (re.test(line)) { re.lastIndex = 0; console.log(`  [${label}]  ${rel}:${i+1}  ${line.trim().slice(0,90)}`); total++ }
        re.lastIndex = 0
      })
    }
  }
}
console.log('=== Design System Audit ===\n')
walk(ROOT)
console.log(`\n${total === 0 ? 'Clean.' : `${total} violation(s).`}`)
