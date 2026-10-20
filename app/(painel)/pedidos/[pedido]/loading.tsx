export default function PedidoFichaLoading() {
  return (
    <div
      className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-3 px-6 py-12"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <div
        className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">Carregando…</p>
    </div>
  )
}
