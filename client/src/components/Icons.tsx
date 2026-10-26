/**
 * Inline SVG icon set (DESIGN.md §11): 20px grid, currentColor stroke,
 * no external icon dependency. Only icons used so far; more are added as needed.
 */

const PATHS: Record<string, { d: string; fill?: boolean }[]> = {
  home: [{ d: 'M3 10.5 10 4l7 6.5M5 9.5V17h10V9.5' }],
  tasks: [{ d: 'M4 5h12M4 10h12M4 15h8' }, { d: 'm2.5 4.8 1 1 1.8-2' }],
  calendar: [
    { d: 'M4 6.5h12M4 5h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z' },
    { d: 'M7 3v3M13 3v3' },
  ],
  chart: [{ d: 'M3.5 16.5V9M8 16.5V4.5M12.5 16.5v-6M17 16.5V7' }],
  bell: [
    {
      d: 'M10 3a5 5 0 0 0-5 5c0 3-.8 4.5-1.5 5.2-.3.4 0 1 .5 1h12c.5 0 .8-.6.5-1C15.8 12.5 15 11 15 8a5 5 0 0 0-5-5Z',
    },
    { d: 'M8.5 17.5a1.7 1.7 0 0 0 3 0' },
  ],
  user: [
    { d: 'M10 10a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z' },
    { d: 'M4 17c.6-2.8 3-4.2 6-4.2s5.4 1.4 6 4.2' },
  ],
  plus: [{ d: 'M10 4.5v11M4.5 10h11' }],
  logout: [
    { d: 'M12 4H16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16h-4' },
    { d: 'm8 10 3.5-3.5M8 10l3.5 3.5M11.5 10H3.5' },
  ],
  sun: [
    { d: 'M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
    {
      d: 'M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3 5.7 5.7M14.3 5.7l-1.4-1.4M15.7 15.7l-1.4-1.4M5.7 14.3l-1.4 1.4',
    },
  ],
  moon: [{ d: 'M15.5 12.2A6.5 6.5 0 0 1 7.8 4.5a6.5 6.5 0 1 0 7.7 7.7Z' }],
  check: [{ d: 'm4 10.5 4 4 8-8' }],
  'check-circle': [
    { d: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z' },
    { d: 'm6.8 10.2 2.2 2.2 4.2-4.6' },
  ],
  circle: [{ d: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z' }],
  trash: [{ d: 'M4.5 6h11M8 6V4.5h4V6M6 6l.6 10.2a1 1 0 0 0 1 .8h4.8a1 1 0 0 0 1-.8L14 6' }],
  pencil: [{ d: 'M13.2 3.9 16.1 6.8 6.4 16.4l-3.6.8.8-3.6 9.6-9.7Z' }],
  x: [{ d: 'M5 5l10 10M15 5 5 15' }],
  alert: [{ d: 'M10 2.8 1.8 17h16.4L10 2.8Z' }, { d: 'M10 8v4M10 14.6v.4' }],
  info: [{ d: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z' }, { d: 'M10 9v5M10 6.2v.4' }],
  search: [
    { d: 'M13.8 13.8 17 17' },
    { d: 'M8.8 14.5a5.7 5.7 0 1 0 0-11.4 5.7 5.7 0 0 0 0 11.4Z' },
  ],
  filter: [{ d: 'M3 5h14M5.5 10h9M8 15h4' }],
  'chevron-left': [{ d: 'm12 5-6 5 6 5' }],
  'chevron-right': [{ d: 'm8 5 6 5-6 5' }],
  'chevron-down': [{ d: 'm5 8 5 5 5-5' }],
  book: [
    {
      d: 'M4 4.5h4.5A2.5 2.5 0 0 1 11 7v9a2 2 0 0 0-2-2H4v-9.5ZM19 4.5h-4.5A2.5 2.5 0 0 0 12 7v9a2 2 0 0 1 2-2h5V4.5Z',
    },
  ],
  target: [
    { d: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z' },
    { d: 'M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z' },
    { d: 'M10 10h.01' },
  ],
  folder: [
    {
      d: 'M3 5.5A1.5 1.5 0 0 1 4.5 4h3.7l1.6 2h5.5A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-9Z',
    },
  ],
  pen: [{ d: 'M4 16.5 14.5 6a1.8 1.8 0 0 1 2.5 2.5L6.5 19H4v-2.5Z' }],
  menu: [{ d: 'M3.5 6h13M3.5 10h13M3.5 14h13' }],
  'arrow-left': [{ d: 'M11.5 5 6 10l5.5 5M6 10h10' }],
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} />
      ))}
    </svg>
  );
}
