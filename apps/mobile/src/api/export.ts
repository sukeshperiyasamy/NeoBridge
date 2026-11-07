import { ApiError, getApiUrl, getToken } from '@/api/client';
import { saveTextFile } from '@/api/save-file';

export type ExportKind = 'readings' | 'daily';

/**
 * Downloads the baby's band data from the server as CSV and hands it to the
 * user: a file download in the browser, the share sheet on a phone (save to
 * Files or Drive, send on WhatsApp or email). Returns the file name.
 */
export async function exportBabyData(babyId: string, kind: ExportKind, days = 15): Promise<string> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(`${await getApiUrl()}/v1/babies/${encodeURIComponent(babyId)}/export?kind=${kind}&days=${days}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  if (!res.ok) throw new ApiError(res.status, 'export_failed');
  const csv = await res.text();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
    `neobridge-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  await saveTextFile(name, csv, 'text/csv');
  return name;
}
