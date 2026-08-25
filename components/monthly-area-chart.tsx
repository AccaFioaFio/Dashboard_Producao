'use client'

import { useId, useMemo, useState } from 'react'
import { formatInt } from '@/lib/format'

export type AreaSeries = {
  key: string
  label: string
  color: string
  values: number[]
}

type Point = { x: number; y: number; value: number }

function toSmoothPath(points: Point[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`
  if (points.length === 2) {
    return `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}`
  }

  const smoothing = 0.32
  let d = `M${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    d += ` C${p1.x + (p2.x - p0.x) * smoothing} ${p1.y + (p2.y - p0.y) * smoothing} ${p2.x - (p3.x - p1.x) * smoothing} ${p2.y - (p3.y - p1.y) * smoothing} ${p2.x} ${p2.y}`
  }
  return d
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

  const width = 960
  const height = 148
  const pad = { top: 18, right: 16, bottom: 22, left: 16 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const baseline = pad.top + innerH

  const max = Math.max(1, ...series.flatMap((item) => item.values))
  const count = Math.max(labels.length, 1)
  const step = count > 1 ? innerW / (count - 1) : 0

  const built = useMemo(
    () =>
      series.map((item) => {
        const points = item.values.map((value, index) => {
          const x = pad.left + index * step
          const y = pad.top + innerH - (value / max) * innerH
          return { x, y, value }
        })
        const line = toSmoothPath(points)
        const area =
          points.length > 0
            ? `${line} L${points[points.length - 1].x} ${baseline} L${points[0].x} ${baseline} Z`
            : ''
        return { ...item, points, line, area }
      }),
    [baseline, innerH, max, pad.left, pad.top, series, step],
  )

  const labelPlacements = useMemo(() => {
    const gap = 14
    return labels.map((_, index) => {
      const items = built
        .map((item) => {
          const point = item.points[index]
          if (!point) return null
          return {
            key: item.key,
            color: item.color,
            value: point.value,
            x: point.x,
            y: point.y,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
        .sort((a, b) => b.y - a.y)

      let lastY = Infinity
      return items.map((item) => {
        let labelY = item.y - 12
        if (lastY - labelY < gap) labelY = lastY - gap
        lastY = labelY
        return { ...item, labelY }
      })
    })
  }, [built, labels])

  if (!labels.length) {
    return (
      <section className="card-surface min-w-0 p-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
        <p className="px-1 py-4 text-sm text-muted-foreground">Sem série mensal.</p>
      </section>
    )
  }

  return (
    <section className="card-surface min-w-0 p-3">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            {series.length === 1 ? (
              <span
                className="size-2.5 rounded-sm"
                style={{ background: series[0].color }}
              />
            ) : null}
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {series.length > 1 ? (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {series.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-sm"
                  style={{ background: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[var(--chart-h)] w-full overflow-visible"
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

        {built.map((item) => (
          <g key={item.key}>
            <path d={item.area} fill={`url(#${gradientId}-${item.key})`} />
            <path
              d={item.line}
              fill="none"
              stroke={item.color}
              strokeWidth="2.25"
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
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="11"
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
                  y2={baseline}
                  className="stroke-foreground/25"
                  strokeDasharray="3 3"
                />
              ) : null}
            </g>
          )
        })}

        {built.map((item) =>
          item.points.map((point, index) => (
            <circle
              key={`${item.key}-${index}`}
              cx={point.x}
              cy={point.y}
              r={active === index ? 4 : 3}
              fill="var(--card)"
              stroke={item.color}
              strokeWidth="2"
            />
          )),
        )}

        {labelPlacements.flatMap((group, index) =>
          group.map((item) => (
            <text
              key={`${item.key}-label-${index}`}
              x={item.x}
              y={item.labelY}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill={item.color}
              stroke="var(--card)"
              strokeWidth="4"
              paintOrder="stroke"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatInt(item.value)}
            </text>
          )),
        )}
      </svg>
    </section>
  )
}
