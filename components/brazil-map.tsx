'use client'

import { useRouter } from 'next/navigation'
import { BRAZIL_MAP, BRAZIL_STATE_PATHS } from '@/lib/brazil-map-paths'
import { ufNome } from '@/lib/uf'
import { formatMoneyCompact } from '@/lib/format'

function fillFor(value: number, max: number, selected: boolean) {
  if (selected) return 'var(--chart-1)'
  if (max <= 0 || value <= 0) return 'var(--muted)'
  const mix = Math.round(22 + (value / max) * 78)
  return `color-mix(in oklch, var(--chart-2) ${mix}%, var(--muted))`
}

type Point = [number, number]

function pathRings(d: string): Point[][] {
  return d
    .split(/Z/i)
    .filter((part) => part.trim())
    .map((part) => {
      const nums = part.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
      const points: Point[] = []
      for (let i = 0; i < nums.length; i += 2) points.push([nums[i]!, nums[i + 1]!])
      return points
    })
    .filter((points) => points.length >= 3)
}

function ringMetrics(points: Point[]) {
  let area = 0
  let cx = 0
  let cy = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]!
    const [nx, ny] = points[(i + 1) % points.length]!
    const cross = x * ny - nx * y
    area += cross
    cx += (x + nx) * cross
    cy += (y + ny) * cross
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  area *= 0.5
  const span = Math.min(maxX - minX, maxY - minY)
  const size = span < 12 ? 5.6 : span < 22 ? 6.6 : span < 34 ? 7.6 : 9
  return { x: cx / (6 * area), y: cy / (6 * area), area: Math.abs(area), size }
}

const STATE_LABELS = BRAZIL_STATE_PATHS.map((state) => {
  const ring = pathRings(state.d)
    .map(ringMetrics)
    .sort((a, b) => b.area - a.area)[0]!
  return { uf: state.uf, x: ring.x, y: ring.y, size: ring.size }
})

export function BrazilMap({
  values,
  selected,
  query,
}: {
  values: Record<string, number>
  selected?: string
  query: string
}) {
  const router = useRouter()
  const max = Math.max(0, ...Object.values(values))
  const hrefFor = (uf: string) => {
    const params = new URLSearchParams(query)
    params.set('uf', uf)
    return `/vendas?${params.toString()}`
  }
  return (
    <div className="card-surface flex min-w-0 flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Mapa · faturado por UF</p>
        <p className="text-[10px] text-muted-foreground">Clique no estado</p>
      </div>
      <svg
        viewBox={`0 0 ${BRAZIL_MAP.width} ${BRAZIL_MAP.height}`}
        role="img"
        aria-label="Mapa do Brasil com faturamento por estado"
        className="h-auto w-full"
      >
        {BRAZIL_STATE_PATHS.map((state) => {
          const value = values[state.uf] ?? 0
          const active = selected === state.uf
          const href = hrefFor(state.uf)
          return (
            <path
              key={state.uf}
              d={state.d}
              role="link"
              tabIndex={0}
              aria-label={`${ufNome(state.uf)} · ${formatMoneyCompact(value)}`}
              fill={fillFor(value, max, active)}
              stroke="var(--background)"
              strokeWidth={active ? 1.6 : 0.6}
              className="cursor-pointer outline-none focus-visible:stroke-[2.4]"
              onClick={() => router.push(href)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  router.push(href)
                }
              }}
            >
              <title>{`${ufNome(state.uf)} · ${formatMoneyCompact(value)}`}</title>
            </path>
          )
        })}
        {STATE_LABELS.map((label) => (
          <text
            key={label.uf}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={label.size}
            fontWeight={700}
            fill="var(--foreground)"
            stroke="var(--background)"
            strokeWidth={label.size * 0.22}
            strokeLinejoin="round"
            paintOrder="stroke"
            pointerEvents="none"
            aria-hidden
            className="font-sans"
          >
            {label.uf}
          </text>
        ))}
      </svg>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>menor</span>
        <span className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-muted to-chart-2" />
        <span>maior</span>
      </div>
    </div>
  )
}
