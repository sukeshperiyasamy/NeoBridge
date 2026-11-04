import type { UserProfile } from '@neobridge/domain';
import type { Key } from '@neobridge/i18n';

export { useT } from './ui';

/** "Neonatologist", "ASHA", "Mother / family" … from the server profile. */
export function roleLabel(t: (k: Key) => string, p: Pick<UserProfile, 'role' | 'specialisation'>): string {
  if (p.role === 'doctor') {
    if (p.specialisation === 'obstetrics') return t('role.obstetrician');
    if (p.specialisation === 'general') return t('role.mo');
    return t('role.neonatologist');
  }
  return t(`role.${p.role}` as Key);
}
