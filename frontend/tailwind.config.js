/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Vouch design tokens (mapped to CSS vars in index.css) ──
        ink: 'var(--ink)',
        paper: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        track: 'var(--track)',
        muted: 'var(--muted)',
        hairline: 'var(--line)',
        hero: 'var(--hero)',
        accent: {
          DEFAULT: 'var(--violet)',
          soft: 'var(--violet-soft)',
          line: 'var(--violet-line)',
          ink: 'var(--violet-ink)',
        },

        // ── Legacy palette (kept so un-migrated pages still build) ──
        navy: { 900: '#0d1b2a', 800: '#1a2f45', 700: '#243b55' },
        brand: { blue: '#4a6cf7', teal: '#00c4b4' },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '5px 5px 0 var(--card-shadow)',
        'card-hover': '7px 7px 0 var(--card-shadow)',
        banner: '6px 6px 0 var(--card-shadow)',
        btn: '4px 4px 0 var(--ink)',
        'btn-violet': '4px 4px 0 var(--violet)',
        modal: '8px 8px 0 var(--violet)',
        badge: '2px 2px 0 var(--ink)',
      },
    },
  },
  plugins: [],
}
