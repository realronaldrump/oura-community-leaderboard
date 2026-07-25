/** Shared Recharts presentation tokens. */

export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-line)',
  borderRadius: 'var(--radius-md)',
  fontSize: '12px',
  color: 'var(--color-ink)',
  boxShadow: 'var(--shadow-card)',
};

export const CHART_TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: 'var(--color-ink-muted)',
};

export const CHART_GRID_STROKE = 'var(--color-line)';

export const CHART_AXIS_STYLE = {
  tick: { fill: 'var(--color-ink-faint)', fontSize: 11 },
  axisLine: { stroke: 'var(--color-line)' },
};

export const CHART_ACTIVE_DOT = {
  r: 5,
  strokeWidth: 2,
  fill: 'var(--color-surface)',
};
