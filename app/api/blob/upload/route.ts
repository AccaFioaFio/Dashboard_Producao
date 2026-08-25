import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { CLOUD_SNAPSHOT_BLOB } from '@/lib/cloud/constants'
import { updateSecretOk } from '@/lib/cloud/secret'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (pathname !== CLOUD_SNAPSHOT_BLOB) {
          throw new Error('Caminho de carga inválido')
        }
        if (!updateSecretOk(clientPayload)) {
          throw new Error('Senha inválida')
        }
        return {
          allowedContentTypes: [
            'application/gzip',
            'application/octet-stream',
            'application/json',
          ],
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: 80 * 1024 * 1024,
          tokenPayload: null,
        }
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no envio'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
