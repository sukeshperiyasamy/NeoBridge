import { adviceTemplateText, type AdviceDto } from '@neobridge/domain';

/** A template advice note in the reader's language (free text is shown as typed). */
export function adviceText(a: Pick<AdviceDto, 'template' | 'body' | 'followUpDate'>, lang: 'en' | 'hi'): string {
  if (!a.template) return a.body;
  return adviceTemplateText[a.template][lang].replace('{date}', a.followUpDate ?? '');
}
