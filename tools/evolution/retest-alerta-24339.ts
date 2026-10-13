/**
 * Lista lançamentos do pedido 24339 na nuvem e limpa avisoDataFinal
 * para permitir novo "Salvar na lista" + WhatsApp.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Supabase não configurado no .env.local')
    process.exit(1)
  }

  const bucket = 'dashboard-carga'
  const prefix = 'corte-operacao/24339/'
  const client = createClient(url, key)
  const limpar = process.argv.includes('--limpar')

  const { data: files, error } = await client.storage
    .from(bucket)
    .list('corte-operacao/24339', { limit: 100 })
  if (error) {
    console.error('list error', error.message)
    process.exit(1)
  }

  console.log(
    'arquivos',
    files?.map((f) => f.name) ?? [],
  )

  const { data: alertas } = await client.storage
    .from(bucket)
    .list('corte-operacao/_alertas', {
      limit: 80,
      sortBy: { column: 'updated_at', order: 'desc' },
    })
  const doPedido = alertas?.filter((f) => f.name.includes('24339')) ?? []
  console.log(
    'alertas_nuvem',
    doPedido.map((f) => ({ name: f.name, updated: f.updated_at })),
  )

  if (!limpar) {
    for (const file of files ?? []) {
      if (!file.name.endsWith('.json')) continue
      const path = `${prefix}${file.name}`
      const { data, error: dlErr } = await client.storage.from(bucket).download(path)
      if (dlErr || !data) continue
      const json = JSON.parse(await data.text()) as Record<string, unknown>
      console.log(file.name, {
        dataFinal: json.dataFinal,
        avisoDataFinal: json.avisoDataFinal,
      })
    }
    console.log('Rode com --limpar para zerar avisoDataFinal e permitir reteste.')
    return
  }

  for (const file of files ?? []) {
    if (!file.name.endsWith('.json')) continue
    const path = `${prefix}${file.name}`
    const { data, error: dlErr } = await client.storage.from(bucket).download(path)
    if (dlErr || !data) {
      console.error('download fail', path, dlErr?.message)
      continue
    }
    const json = JSON.parse(await data.text()) as Record<string, unknown>
    console.log(file.name, {
      dataFinal: json.dataFinal,
      avisoDataFinal: json.avisoDataFinal,
    })
    json.avisoDataFinal = null
    json.atualizadoEm = new Date().toISOString()
    const blob = new Blob([JSON.stringify(json, null, 2)], {
      type: 'application/json',
    })
    const { error: upErr } = await client.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType: 'application/json',
    })
    if (upErr) console.error('upload fail', path, upErr.message)
    else console.log('limpo', path)
  }

  console.log('Pronto. Abra o pedido 24339 (next local) e clique Salvar na lista.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
