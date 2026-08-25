export const APPEARANCE_STORAGE_KEY = 'pdr-appearance'

export const THEMES = [
  {
    id: 'violeta',
    label: 'Violeta',
    hint: 'Padrão do painel',
    swatches: ['#3d2e8a', '#7c5cbf', '#e8e4f4'],
  },
  {
    id: 'noite',
    label: 'Noite',
    hint: 'Escuro, contraste alto',
    swatches: ['#070b18', '#3b82f6', '#22d3ee'],
  },
  {
    id: 'neon',
    label: 'Neon',
    hint: 'Ciano e magenta',
    swatches: ['#05060f', '#22d3ee', '#f472b6'],
  },
  {
    id: 'aurora',
    label: 'Aurora',
    hint: 'Verde e teal',
    swatches: ['#ecfdf5', '#0f766e', '#34d399'],
  },
  {
    id: 'cobre',
    label: 'Cobre',
    hint: 'Quente, industrial',
    swatches: ['#1c1410', '#d97706', '#fb923c'],
  },
  {
    id: 'grafite',
    label: 'Grafite',
    hint: 'Neutro, limpo',
    swatches: ['#f4f4f5', '#18181b', '#71717a'],
  },
] as const

export const LAYOUTS = [
  {
    id: 'conforto',
    label: 'Conforto',
    hint: 'Equilíbrio entre respiro e dados',
  },
  {
    id: 'compacto',
    label: 'Compacto',
    hint: 'Mais dados na tela',
  },
  {
    id: 'amplo',
    label: 'Amplo',
    hint: 'Respiro e leitura',
  },
  {
    id: 'vidro',
    label: 'Vidro',
    hint: 'Glass e brilho',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type LayoutId = (typeof LAYOUTS)[number]['id']

export type Appearance = {
  theme: ThemeId
  layout: LayoutId
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'violeta',
  layout: 'compacto',
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function isLayoutId(value: unknown): value is LayoutId {
  return LAYOUTS.some((layout) => layout.id === value)
}

export function parseAppearance(raw: unknown): Appearance {
  if (!raw || typeof raw !== 'object') return DEFAULT_APPEARANCE
  const value = raw as Record<string, unknown>
  return {
    theme: isThemeId(value.theme) ? value.theme : DEFAULT_APPEARANCE.theme,
    layout: isLayoutId(value.layout) ? value.layout : DEFAULT_APPEARANCE.layout,
  }
}

export const APPEARANCE_BOOTSTRAP = `(function(){try{var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var raw=localStorage.getItem(k);if(!raw)return;var a=JSON.parse(raw);var r=document.documentElement;if(a&&typeof a.theme==='string')r.setAttribute('data-theme',a.theme);if(a&&typeof a.layout==='string')r.setAttribute('data-layout',a.layout);}catch(e){}})();`
