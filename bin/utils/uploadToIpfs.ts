import uploadToIpfsSplit from './uploadToIpfsSplit';

/**
 * @deprecated Legacy upload entry kept for compatibility.
 * Use `uploadToIpfsSplit` directly for all new code.
 */
export default async function uploadToIpfs(
  filePath: string,
  options?: { importAsCar?: boolean; projectName?: string },
): Promise<{
  contentHash: string;
  shortUrl?: string;
} | null> {
  return uploadToIpfsSplit(filePath, options);
}
