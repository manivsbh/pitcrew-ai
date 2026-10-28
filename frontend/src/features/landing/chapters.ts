export const chapters = [
  { id: 'introduction', number: '00', label: 'The bigger picture', title: 'Every machine.\nA deeper understanding.', description: 'From the first drawing to the next discovery. A connected workspace to explore, experiment, and follow the evidence.', note: 'Built for curious engineers. Grounded in transparent tools.', image: 'poster', start: 0, end: .8, progress: 0 },
  { id: 'blueprint', number: '01', label: 'Blueprint', title: 'See beyond\nthe drawing.', description: 'Bring dimensions, components, and machine context into one place. Turn a collection of parts into a clearer picture.', note: 'Blueprint intake preview available. Automated reconstruction is planned.', image: 'blueprint', start: .8, end: 2.6, progress: .16 },
  { id: 'simulate', number: '02', label: 'Simulate', title: 'Change a variable.\nUnderstand the difference.', description: 'Explore power, torque, stress, and efficiency through explicit equations. Every result starts with an input you can inspect.', note: 'Simplified frontend models. Not validated physical simulation.', image: 'simulate', start: 2.6, end: 4, progress: .36 },
  { id: 'investigate', number: '03', label: 'Investigate', title: 'Find the part.\nFollow the evidence.', description: 'Move from a signal to a hypothesis—and back to the component. See the steps, sources, and limitations behind a finding.', note: 'Synthetic diagnostic replay. No live AI model connected.', image: 'investigate', start: 4, end: 5.6, progress: .56 },
  { id: 'experiment', number: '04', label: 'Experiment', title: 'A better question.\nYour next breakthrough.', description: 'Ask “what if?” Compare a candidate with your baseline. Review the trade-offs, then decide what changes.', note: 'Local typed and optional browser speech commands. No real-world failure predictions.', image: 'experiment', start: 5.6, end: 7.95, progress: .78 },
]
export function mapProgress(progress: number) {
  const p = Math.min(1, Math.max(0, progress))
  let index = chapters.length - 1
  for (let i = 0; i < chapters.length - 1; i++) if (p < chapters[i + 1].progress) { index = i; break }
  const chapter = chapters[index], end = chapters[index + 1]?.progress ?? 1
  return { index, time: chapter.start + (chapter.end - chapter.start) * (p - chapter.progress) / (end - chapter.progress) }
}
