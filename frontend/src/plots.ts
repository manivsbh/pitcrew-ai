import Plotly from 'plotly.js-dist';

export interface Series {
  x: number[];
  y: number[];
  xlabel?: string;
  ylabel?: string;
  peaks?: { freq: number; amp: number }[];
  targets?: Record<string, number>;
}

const ACCENT = '#0e6b5e';

export function linePlot(div: HTMLElement, s: Series, title: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traces: any[] = [
    { x: s.x, y: s.y, type: 'scatter', mode: 'lines', line: { width: 1 }, name: title },
  ];
  if (s.peaks && s.peaks.length) {
    traces.push({
      x: s.peaks.map((p) => p.freq),
      y: s.peaks.map((p) => p.amp),
      type: 'scatter',
      mode: 'markers+text',
      text: s.peaks.map((p) => p.freq.toFixed(1)),
      textposition: 'top',
      marker: { size: 6 },
      name: 'peaks',
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shapes: any[] = [];
  if (s.targets) {
    for (const [label, f] of Object.entries(s.targets)) {
      shapes.push({
        type: 'line',
        x0: f,
        x1: f,
        y0: 0,
        y1: 1,
        yref: 'paper',
        line: { color: ACCENT, width: 1, dash: 'dash' },
      });
      traces.push({ x: [f], y: [0], type: 'scatter', mode: 'text', text: [label], showlegend: false });
    }
  }
  Plotly.react(div, traces, {
    margin: { l: 56, r: 16, t: 28, b: 44 },
    xaxis: { title: { text: s.xlabel ?? 'x' } },
    yaxis: { title: { text: s.ylabel ?? 'y' } },
    shapes,
    showlegend: false,
  });
}

export function clearPlot(div: HTMLElement): void {
  Plotly.purge(div);
  div.innerHTML = '';
}
