'use client'

import { useId, useMemo, useState } from 'react'
import { formatInt } from '@/lib/format'

export type AreaSeries = {
  key: string
  label: string
  color: string
  values: number[]
}

export function MonthlyAreaChart({
  title,
  description,
  labels,
  series,
}: {
  title: string
  description?: string
  labels: string[]
  series: AreaSeries[]
}) {
  const gradientId = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)

  const width = 640
  const height = 220
  const pad = { top: 16, right: 12, bottom: 28, left: 44 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const max = Math.max(
    1,
    ...series.flatMap((item) => item.values),
  )
  const count = Math.max(labels.length, 1)
  const step = count > 1 ? innerW / (count - 1) : 0

  const yTicks = [0, 0.5, 1].map((ratio) => ({
    y: pad.top + innerH * (1 - ratio),
    value: max * ratio,
  }))

  const built = useMemo(
    () =>
      series.map((item) => {
        const points = item.values.map((value, index) => {
          const x = pad.left + index * step
          const y = pad.top + innerH - (value / max) * innerH
          return { x, y, value }
        })
        const line = points
          .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
          .join(' ')
        const area =
          points.length > 0
            ? `${line} L${points[points.length - 1].x} ${pad.top + innerH} L${points[0].x} ${pad.top + innerH} Z`
            : ''
        return { ...item, points, line, area }
      }),
    [series, innerH, max, pad.left, pad.top, step],
  )

  if (!labels.length) {
    return (
      <section className="card-surface min-w-0 p-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
        <p className="px-1 py-6 text-sm text-muted-foreground">Sem série mensal.</p>
      </section>
    )
  }

  return (
    <section className="card-surface min-w-0 p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ background: item.color }}
              />
              {item.label}
              {active != null ? (
                <span className="font-mono text-foreground">
                  {formatInt(item.values[active] ?? 0)}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-60 w-full"
        role="img"
        aria-label={title}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          {built.map((item) => (
            <linearGradient
              key={item.key}
              id={`${gradientId}-${item.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={item.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={item.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={pad.left - 8}
              y={tick.y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
            >
              {formatInt(tick.value)}
            </text>
          </g>
        ))}

        {built.map((item) => (
          <g key={item.key}>
            <path d={item.area} fill={`url(#${gradientId}-${item.key})`} />
            <path
              d={item.line}
              fill="none"
              stroke={item.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}

        {labels.map((label, index) => {
          const x = pad.left + index * step
          return (
            <g key={label}>
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="10"
              >
                {label}
              </text>
              <rect
                x={x - step / 2}
                y={pad.top}
                width={count > 1 ? step : innerW}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setActive(index)}
              />
              {active === index ? (
                <line
                  x1={x}
                  x2={x}
                  y1={pad.top}
                  y2={pad.top + innerH}
                  className="stroke-foreground/30"
                  strokeDasharray="3 3"
                />
              ) : null}
            </g>
          )
        })}

        {active != null
          ? built.map((item) => {
              const point = item.points[active]
              if (!point) return null
              return (
                <circle
                  key={item.key}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="var(--card)"
                  stroke={item.color}
                  strokeWidth="2"
                />
              )
            })
          : null}
      </svg>
    </section>
  )
}
