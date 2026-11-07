/** Browser: a normal file download. */
export async function saveTextFile(name: string, text: string, mimeType: string): Promise<void> {
  // the byte-order mark lets Excel open the file as UTF-8 (Hindi names)
  const blob = new Blob(['﻿', text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
