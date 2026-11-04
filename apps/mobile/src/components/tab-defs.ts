import type { Key } from '@neobridge/i18n';

export interface TabDef {
  /** route file name inside the role folder */
  name: string;
  href: string;
  label: Key;
  icon: 'home' | 'explore';
}

/** Mother: Home · Baby · Reminders · Call · Band */
export const motherTabs: TabDef[] = [
  { name: 'index', href: '/mother', label: 'nav.home', icon: 'home' },
  { name: 'baby', href: '/mother/baby', label: 'nav.baby', icon: 'explore' },
  { name: 'reminders', href: '/mother/reminders', label: 'nav.reminders', icon: 'explore' },
  { name: 'call', href: '/mother/call', label: 'nav.call', icon: 'explore' },
  { name: 'band', href: '/mother/band', label: 'nav.band', icon: 'explore' },
];

/** ASHA: Babies · Visits · Alerts · Register · Profile */
export const ashaTabs: TabDef[] = [
  { name: 'index', href: '/asha', label: 'nav.babies', icon: 'home' },
  { name: 'visits', href: '/asha/visits', label: 'nav.visits', icon: 'explore' },
  { name: 'alerts', href: '/asha/alerts', label: 'nav.alerts', icon: 'explore' },
  { name: 'register', href: '/asha/register', label: 'nav.register', icon: 'explore' },
  { name: 'profile', href: '/asha/profile', label: 'nav.profile', icon: 'explore' },
];

/** Doctor: Dashboard · Patients · Alerts · Notes · Profile */
export const doctorTabs: TabDef[] = [
  { name: 'index', href: '/doctor', label: 'nav.dashboard', icon: 'home' },
  { name: 'patients', href: '/doctor/patients', label: 'nav.patients', icon: 'explore' },
  { name: 'alerts', href: '/doctor/alerts', label: 'nav.alerts', icon: 'explore' },
  { name: 'notes', href: '/doctor/notes', label: 'nav.notes', icon: 'explore' },
  { name: 'profile', href: '/doctor/profile', label: 'nav.profile', icon: 'explore' },
];
