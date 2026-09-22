import { existsSync, readFileSync } from 'node:fs'
import { checkpointSqlite, getSqlite } from '@/db'
import { createAdminClient, isSupabaseWriteConfigured } from '@/lib/supabase/admin'
import { CARGA_BUCKET, CARGA_OBJECT } from '@/lib/supabase/constants'
import { DB_PATH } from '@/lib/paths'

export type PublishSupabaseResult =
  | { ok: true; lidaEm: string }
  | { ok: false; error: string }

type CargaRow = {
  lidaEm: string
  cortePath: string
  oficinasPath: string
  signusPath: string | null
  estoquePath: string | null
  pedidosPath: string | null
  itensPath: string | null
  corteLastWrite: string | null
  oficinasLastWrite: string | null
  signusLastWrite: string | null
  estoqueLastWrite: string | null
  pedidosLastWrite: string | null
  itensLastWrite: string | null
  pecasCortadas: number | null
  pedidosCorte: number | null
  pecasCosturaProd: number | null
  pecasRevisao: number | null
  wipPedidos: number | null
  wipPecas: number | null
  tecidoPedidos: number | null
  tecidoPecas: number | null
  oficinasPendentes: number | null
}

function readLatestLocalCarga(): CargaRow | null {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT lida_em as lidaEm, corte_path as cortePath, oficinas_path as oficinasPath,
                signus_path as signusPath, estoque_path as estoquePath,
                pedidos_path as pedidosPath, itens_path as itensPath,
                corte_last_write as corteLastWrite, oficinas_last_write as oficinasLastWrite,
                signus_last_write as signusLastWrite, estoque_last_write as estoqueLastWrite,
                pedidos_last_write as pedidosLastWrite, itens_last_write as itensLastWrite,
                pecas_cortadas as pecasCortadas, pedidos_corte as pedidosCorte,
                pecas_costura_prod as pecasCosturaProd, pecas_revisao as pecasRevisao,
                wip_pedidos as wipPedidos, wip_pecas as wipPecas,
                tecido_pedidos as tecidoPedidos, tecido_pecas as tecidoPecas,
                oficinas_pendentes as oficinasPendentes
         FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
      )
      .get() as CargaRow | undefined
    return row ?? null
  } catch {
    return null
  }
}

/**
 * Publica o SQLite local no Supabase Storage + carimbo em public.carga.
 * Igual ao Orçamentos: processa neste PC e a nuvem passa a servir a carga.
 */
export async function publishSqliteToSupabase(): Promise<PublishSupabaseResult> {
  if (!isSupabaseWriteConfigured()) {
    return {
      ok: false,
      error:
        'Falta Supabase no .env.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).',
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { ok: false, error: 'Não foi possível criar o client admin do Supabase.' }
  }

  checkpointSqlite()
  if (!existsSync(DB_PATH)) {
    return { ok: false, error: `SQLite local ausente: ${DB_PATH}` }
  }

  const local = readLatestLocalCarga()
  if (!local?.lidaEm) {
    return {
      ok: false,
      error: 'Não há carga ok no SQLite local. Rode a atualização (Excel) antes de publicar.',
    }
  }

  const bytes = readFileSync(DB_PATH)
  const { error: uploadError } = await admin.storage
    .from(CARGA_BUCKET)
    .upload(CARGA_OBJECT, bytes, {
      upsert: true,
      contentType: 'application/vnd.sqlite3',
      cacheControl: '0',
    })

  if (uploadError) {
    return {
      ok: false,
      error: `Falha ao enviar SQLite ao Supabase Storage: ${uploadError.message}`,
    }
  }

  const { error: insertError } = await admin.from('carga').insert({
    lida_em: local.lidaEm,
    corte_path: local.cortePath,
    oficinas_path: local.oficinasPath,
    signus_path: local.signusPath,
    estoque_path: local.estoquePath,
    pedidos_path: local.pedidosPath,
    itens_path: local.itensPath,
    corte_last_write: local.corteLastWrite,
    oficinas_last_write: local.oficinasLastWrite,
    signus_last_write: local.signusLastWrite,
    estoque_last_write: local.estoqueLastWrite,
    pedidos_last_write: local.pedidosLastWrite,
    itens_last_write: local.itensLastWrite,
    pecas_cortadas: local.pecasCortadas,
    pedidos_corte: local.pedidosCorte,
    pecas_costura_prod: local.pecasCosturaProd,
    pecas_revisao: local.pecasRevisao,
    wip_pedidos: local.wipPedidos,
    wip_pecas: local.wipPecas,
    tecido_pedidos: local.tecidoPedidos,
    tecido_pecas: local.tecidoPecas,
    oficinas_pendentes: local.oficinasPendentes,
    ok: true,
    erro: null,
    storage_path: `${CARGA_BUCKET}/${CARGA_OBJECT}`,
  })

  if (insertError) {
    return {
      ok: false,
      error: `SQLite enviado, mas falhou o carimbo em public.carga: ${insertError.message}`,
    }
  }

  return { ok: true, lidaEm: local.lidaEm }
}
