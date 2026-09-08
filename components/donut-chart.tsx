'use client'

import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export type DonutSlice = {
  key: string
  label: string
  value: number
  color: string
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export function DonutChart({
  title,
  description,
  slices,
  centerLabel,
  compact = false,
}: {
  title: string
  description?: string
  slices: DonutSlice[]
  centerLabel?: string
  compact?: boolean
}) {
  const positive = slices
    .map((slice) => ({ ...slice, value: Math.max(0, slice.value) }))
    .filter((slice) => slice.value > 0)
  const total = positive.reduce((sum, slice) => sum + slice.value, 0)

  const vb = compact ? 320 : 360
  const cx = vb / 2
  const cy = vb / 2
  const radius = compact ? 58 : 72
  const stroke = compact ? 26 : 32
  const circ = 2 * Math.PI * radius
  const labelReach = radius + stroke * 0.55 + (compact ? 42 : 50)

  if (!total) {
    return (
      <section className="card-surface flex h-full min-w-0 flex-col items-center justify-center p-3 text-center">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
        <p className="py-3 text-sm text-muted-foreground">Sem volume no recorte.</p>
      </section>
    )
  }

  let offset = 0
  let angle = 0
  const arcs = positive.map((slice) => {
    const portion = slice.value / total
    const dash = portion * circ
    const midAngle = angle + portion * 180
    const tip = polar(cx, cy, radius + stroke * 0.55 + 8, midAngle)
    const outer = polar(cx, cy, labelReach, midAngle)
    const item = {
      ...slice,
      dash,
      offset,
      pct: portion * 100,
      tip,
      outer,
      midAngle,
    }
    offset += dash
    angle += portion * 360
    return item
  })

  const pctFont = compact ? 15 : 17
  const legendClass = compact ? 'text-xs' : 'text-sm'

  return (
    <section className="card-surface flex h-full min-w-0 flex-col items-center justify-center gap-2 p-3 text-center">
      <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center justify-center gap-5',
          compact ? 'flex-row' : 'flex-col sm:flex-row',
        )}
      >
        <svg
          viewBox={`0 0 ${vb} ${vb}`}
          className={cn(
            'block w-full shrink-0 overflow-visible',
            compact ? 'h-44 max-w-[16rem]' : 'h-56 max-w-[18rem]',
          )}
          role="img"
          aria-label={title}
        >
          {arcs.map((slice) => (
            <circle
              key={slice.key}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${slice.dash} ${circ - slice.dash}`}
              strokeDashoffset={-slice.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
          {arcs.map((slice) => {
            const right = slice.midAngle <= 180
            return (
              <g key={`${slice.key}-label`}>
                <line
                  x1={slice.tip.x}
                  y1={slice.tip.y}
                  x2={slice.outer.x}
                  y2={slice.outer.y}
                  stroke={slice.color}
                  strokeWidth="1.5"
                />
                <circle cx={slice.tip.x} cy={slice.tip.y} r="3" fill={slice.color} />
                <text
                  x={slice.outer.x + (right ? 5 : -5)}
                  y={slice.outer.y + 5}
                  textAnchor={right ? 'start' : 'end'}
                  fontSize={pctFont}
                  fontWeight="700"
                  fill={slice.color}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatNumber(slice.pct, 2)}%
                </text>
              </g>
            )
          })}
          {centerLabel ? (
            <text
              x={cx}
              y={cy + 5}
              textAnchor="middle"
              className="fill-foreground"
              fontSize="15"
              fontWeight="700"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {centerLabel}
            </text>
          ) : null}
        </svg>
        <div className={cn('flex flex-col gap-2.5 text-left', legendClass)}>
          {arcs.map((slice) => (
            <div key={slice.key} className="inline-flex items-center gap-2.5">
              <span
                className="size-3 shrink-0 rounded-full ring-1 ring-black/5"
                style={{ backgroundColor: slice.color }}
              />
              <span
                className="font-semibold tracking-wide uppercase"
                style={{ color: slice.color }}
              >
                {slice.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
