import assert from 'node:assert/strict'
import { chapters, mapProgress } from './chapters.ts'
assert.equal(mapProgress(-1).time, 0)
assert.equal(mapProgress(2).time, 7.95)
for (const [index, chapter] of chapters.entries()) {
  assert.equal(mapProgress(chapter.progress).index, index)
  assert.equal(mapProgress(chapter.progress).time, chapter.start)
}
let previous = 0
for (let i = 0; i <= 1000; i++) {
  const { time, index } = mapProgress(i / 1000)
  assert.ok(Number.isFinite(time) && time >= previous && time <= 7.95)
  assert.ok(index >= 0 && index < chapters.length)
  previous = time
}
console.log('Landing chapter mapping passed: clamps, boundaries and monotonic film timing.')
