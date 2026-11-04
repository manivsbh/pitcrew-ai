import assert from "node:assert/strict"
import { chapters, mapProgress, mapScroll } from "./chapters.ts"
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
const tops = [0, 900, 2400, 3100, 4000]
assert.deepEqual(mapScroll(-50, tops, 5200), { index: 0, time: 0 })
assert.equal(mapScroll(2400, tops, 5200).index, 2)
assert.equal(mapScroll(2400, tops, 5200).time, chapters[2].start)
assert.equal(mapScroll(1650, tops, 5200).index, 1)
assert.equal(mapScroll(9999, tops, 5200).time, chapters[4].end)
previous = 0
for (let y = 0; y <= 5200; y += 13) {
  const { time } = mapScroll(y, tops, 5200)
  assert.ok(time >= previous)
  previous = time
}
console.log(
  "Landing chapter mapping passed: clamps, boundaries, monotonic film timing, DOM-anchored chapters.",
)
