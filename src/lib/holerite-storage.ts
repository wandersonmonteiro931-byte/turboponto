import { supabase } from "@/integrations/supabase/client";

/**
 * Extrai bucket + caminho de uma URL de storage (pública ou assinada).
 */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Resolve uma URL utilizável para o PDF do holerite.
 * Buckets privados (ex.: "holerites") precisam de URL assinada.
 */
export async function resolverUrlHoleritePdf(pdfUrl: string): Promise<string> {
  const parsed = parseStorageUrl(pdfUrl);
  if (!parsed) return pdfUrl;

  const { data } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 600, {
    download: true,
  });
  return data?.signedUrl ?? pdfUrl;
}
