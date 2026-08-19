// =====================================================
// THEMES - Catálogo de temas de colores del sistema
// =====================================================

export const THEMES = [
  {
    id: 'amber',
    name: 'Ámbar',
    emoji: '🟡',
    accent: '#f59e0b',
    accentHover: '#d97706',
    accentSoft: 'rgba(245, 158, 11, 0.12)',
    accentGlow: 'rgba(245, 158, 11, 0.25)',
    shadowAccent: '0 4px 20px rgba(245, 158, 11, 0.3)',
  },
  {
    id: 'blue',
    name: 'Azul Zafiro',
    emoji: '🔵',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    accentSoft: 'rgba(59, 130, 246, 0.12)',
    accentGlow: 'rgba(59, 130, 246, 0.25)',
    shadowAccent: '0 4px 20px rgba(59, 130, 246, 0.3)',
  },
  {
    id: 'emerald',
    name: 'Esmeralda',
    emoji: '🟢',
    accent: '#10b981',
    accentHover: '#059669',
    accentSoft: 'rgba(16, 185, 129, 0.12)',
    accentGlow: 'rgba(16, 185, 129, 0.25)',
    shadowAccent: '0 4px 20px rgba(16, 185, 129, 0.3)',
  },
  {
    id: 'violet',
    name: 'Violeta',
    emoji: '🟣',
    accent: '#8b5cf6',
    accentHover: '#7c3aed',
    accentSoft: 'rgba(139, 92, 246, 0.12)',
    accentGlow: 'rgba(139, 92, 246, 0.25)',
    shadowAccent: '0 4px 20px rgba(139, 92, 246, 0.3)',
  },
  {
    id: 'rose',
    name: 'Rosa',
    emoji: '🌹',
    accent: '#f43f5e',
    accentHover: '#e11d48',
    accentSoft: 'rgba(244, 63, 94, 0.12)',
    accentGlow: 'rgba(244, 63, 94, 0.25)',
    shadowAccent: '0 4px 20px rgba(244, 63, 94, 0.3)',
  },
  {
    id: 'cyan',
    name: 'Cian',
    emoji: '🩵',
    accent: '#06b6d4',
    accentHover: '#0891b2',
    accentSoft: 'rgba(6, 182, 212, 0.12)',
    accentGlow: 'rgba(6, 182, 212, 0.25)',
    shadowAccent: '0 4px 20px rgba(6, 182, 212, 0.3)',
  },
  {
    id: 'orange',
    name: 'Naranja',
    emoji: '🟠',
    accent: '#f97316',
    accentHover: '#ea580c',
    accentSoft: 'rgba(249, 115, 22, 0.12)',
    accentGlow: 'rgba(249, 115, 22, 0.25)',
    shadowAccent: '0 4px 20px rgba(249, 115, 22, 0.3)',
  },
  {
    id: 'fuchsia',
    name: 'Fucsia',
    emoji: '🩷',
    accent: '#d946ef',
    accentHover: '#c026d3',
    accentSoft: 'rgba(217, 70, 239, 0.12)',
    accentGlow: 'rgba(217, 70, 239, 0.25)',
    shadowAccent: '0 4px 20px rgba(217, 70, 239, 0.3)',
  },
  {
    id: 'red',
    name: 'Rojo',
    emoji: '🔴',
    accent: '#ef4444',
    accentHover: '#dc2626',
    accentSoft: 'rgba(239, 68, 68, 0.12)',
    accentGlow: 'rgba(239, 68, 68, 0.25)',
    shadowAccent: '0 4px 20px rgba(239, 68, 68, 0.3)',
  },
  {
    id: 'indigo',
    name: 'Índigo',
    emoji: '🫐',
    accent: '#6366f1',
    accentHover: '#4f46e5',
    accentSoft: 'rgba(99, 102, 241, 0.12)',
    accentGlow: 'rgba(99, 102, 241, 0.25)',
    shadowAccent: '0 4px 20px rgba(99, 102, 241, 0.3)',
  },
  {
    id: 'teal',
    name: 'Teal',
    emoji: '🌊',
    accent: '#14b8a6',
    accentHover: '#0d9488',
    accentSoft: 'rgba(20, 184, 166, 0.12)',
    accentGlow: 'rgba(20, 184, 166, 0.25)',
    shadowAccent: '0 4px 20px rgba(20, 184, 166, 0.3)',
  },
  {
    id: 'lime',
    name: 'Lima',
    emoji: '💛',
    accent: '#84cc16',
    accentHover: '#65a30d',
    accentSoft: 'rgba(132, 204, 22, 0.12)',
    accentGlow: 'rgba(132, 204, 22, 0.25)',
    shadowAccent: '0 4px 20px rgba(132, 204, 22, 0.3)',
  },
]

/**
 * Aplica un tema de color al documento (modifica CSS custom properties en :root)
 * @param {string} themeId - ID del tema a aplicar
 */
export function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId)
  if (!theme) return

  const root = document.documentElement
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--accent-hover', theme.accentHover)
  root.style.setProperty('--accent-soft', theme.accentSoft)
  root.style.setProperty('--accent-glow', theme.accentGlow)
  root.style.setProperty('--shadow-accent', theme.shadowAccent)
}
