'use client'

import { Check, LayoutDashboard, Palette } from 'lucide-react'
import { useAppearance } from '@/components/appearance-provider'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { LAYOUTS, THEMES } from '@/lib/appearance'
import { cn } from '@/lib/utils'

export function AppearancePanel() {
  const { theme, layout, setTheme, setLayout } = useAppearance()

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-full bg-white/12 px-2.5 text-header-foreground hover:bg-white/18 hover:text-header-foreground"
          />
        }
      >
        <Palette className="size-3.5" />
        <span className="hidden lg:inline">Aparência</span>
      </SheetTrigger>
      <SheetContent className="w-[min(100%,22rem)] gap-0 overflow-y-auto border-l border-border/80 bg-background/95 backdrop-blur-xl">
        <SheetHeader className="border-b border-border/70">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Palette className="size-4" />
            </span>
            Aparência
          </SheetTitle>
          <SheetDescription>
            Cores e densidade do painel. A escolha fica neste navegador.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Cores
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((item) => {
                const active = theme === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTheme(item.id)}
                    className={cn(
                      'group relative flex flex-col gap-2 rounded-xl border p-3 text-left transition',
                      active
                        ? 'border-primary/70 bg-primary/10 shadow-[0_0_24px_-8px_var(--primary)]'
                        : 'border-border/80 bg-card/60 hover:border-primary/40',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      {active ? <Check className="size-3.5 text-primary" /> : null}
                    </span>
                    <span className="flex gap-1">
                      {item.swatches.map((color) => (
                        <span
                          key={color}
                          className="h-5 flex-1 rounded-md ring-1 ring-black/10"
                          style={{ background: color }}
                        />
                      ))}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{item.hint}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Layout
            </h3>
            <div className="grid gap-2">
              {LAYOUTS.map((item) => {
                const active = layout === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLayout(item.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                      active
                        ? 'border-primary/70 bg-primary/10'
                        : 'border-border/80 bg-card/60 hover:border-primary/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 items-center justify-center rounded-lg',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted',
                      )}
                    >
                      <LayoutDashboard className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {item.hint}
                      </span>
                    </span>
                    {active ? <Check className="size-3.5 text-primary" /> : null}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
