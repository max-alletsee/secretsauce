// frontend/src/components/noDragAndDrop.test.ts
//
// Regression guard: meal-plan recipe assignment must use explicit selection
// (AddToPlanButton / RecipePicker / EntryActionsMenu), NOT drag & drop.
//
// Background: commit 48e2fc5 replaced HTML5 drag-and-drop with explicit
// selection. The native drag handlers (dragItem.ts, dataTransfer) were removed,
// but the `vuedraggable` dependency lingered in package.json long after, which
// made it look like drag & drop might still be present. These tests fail loudly
// if EITHER form of drag (native HTML5 or the vuedraggable/Sortable library)
// creeps back into the meal-plan UI source.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(vue|ts)$/.test(name) && !name.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

const sourceFiles = walk(srcRoot)

// Patterns that indicate drag-and-drop, in either flavor.
const DRAG_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'vuedraggable import', re: /from\s+['"]vuedraggable['"]/ },
  { label: '<draggable> component', re: /<draggable[\s/>]/ },
  { label: 'SortableJS usage', re: /\bSortable\b/ },
  { label: 'native draggable attribute', re: /draggable\s*=\s*["']true["']/ },
  { label: 'HTML5 dragstart handler', re: /@dragstart|ondragstart/ },
  { label: 'HTML5 drop handler', re: /@drop\b|ondrop\b/ },
  { label: 'dataTransfer (HTML5 DnD)', re: /dataTransfer/ },
]

describe('meal-plan assignment uses selection, not drag & drop', () => {
  it('vuedraggable is not a declared dependency', () => {
    const pkg = JSON.parse(readFileSync(join(srcRoot, '..', 'package.json'), 'utf8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(allDeps)).not.toContain('vuedraggable')
  })

  it('no source file contains drag-and-drop code', () => {
    const offenders: string[] = []
    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8')
      for (const { label, re } of DRAG_PATTERNS) {
        if (re.test(content)) {
          offenders.push(`${file.replace(srcRoot, 'src')}: ${label}`)
        }
      }
    }
    expect(offenders, `drag-and-drop code found:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the explicit-selection components exist', () => {
    for (const name of ['AddToPlanButton.vue', 'RecipePicker.vue', 'EntryActionsMenu.vue']) {
      expect(() => statSync(join(srcRoot, 'components', name))).not.toThrow()
    }
  })
})
