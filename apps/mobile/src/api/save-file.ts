import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Phone: writes the file to the app's cache and opens the share sheet for it. */
export async function saveTextFile(name: string, text: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, UTI: 'public.comma-separated-values-text' });
}
