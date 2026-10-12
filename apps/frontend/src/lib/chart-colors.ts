// Chart palette from app-unified.html, in the order series should take it.
export const CHART_COLORS = [
  '#3dae68', '#4fc87b', '#7ddba0', '#1f2a22', '#2d7a4a', '#0e7490', '#ca8a04', '#dc2626', '#556655',
] as const;

export const CHART_STATUS = {
  good: '#3dae68',
  mid: '#7ddba0',
  bad: '#dc2626',
  warn: '#ca8a04',
  info: '#0e7490',
  neutral: '#556655',
  grid: '#e2ebe2',
  axis: '#8a9a8a',
} as const;
