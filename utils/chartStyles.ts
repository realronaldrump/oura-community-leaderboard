/**
 * Shared Recharts styling constants for claymorphism design.
 * Use these instead of inline style objects to keep charts visually consistent.
 */

export const CLAY_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: '12px',
  fontSize: '12px',
  color: '#2D2A26',
  boxShadow: '4px 4px 8px rgba(0,0,0,0.06), -4px -4px 8px rgba(255,255,255,0.8)',
};

export const CLAY_TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: '#7A756E',
};

export const CLAY_GRID_STROKE = 'rgba(0,0,0,0.06)';

export const CLAY_AXIS_STYLE = {
  tick: { fill: '#A8A29E', fontSize: 11 },
  axisLine: { stroke: 'rgba(0,0,0,0.08)' },
};

export const CLAY_ACTIVE_DOT = {
  r: 5,
  strokeWidth: 2,
  fill: '#FFFFFF',
};
