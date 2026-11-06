import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

import type { Key } from '@neobridge/i18n';

export interface TabDef {
  /** route file name inside the role folder */
  name: string;
  href: string;
  label: Key;
  /** Material Symbol on Android, SF Symbol on iOS. */
  icon: { md: AndroidSymbol; sf: SFSymbol };
}

/** Mother: Home · Baby · Reminders · Call · Band */
export const motherTabs: TabDef[] = [
  { name: 'index', href: '/mother', label: 'nav.home', icon: { md: 'home', sf: 'house.fill' } },
  { name: 'baby', href: '/mother/baby', label: 'nav.baby', icon: { md: 'child_care', sf: 'face.smiling' } },
  { name: 'reminders', href: '/mother/reminders', label: 'nav.reminders', icon: { md: 'notifications', sf: 'bell.fill' } },
  { name: 'call', href: '/mother/call', label: 'nav.call', icon: { md: 'call', sf: 'phone.fill' } },
  { name: 'band', href: '/mother/band', label: 'nav.band', icon: { md: 'watch', sf: 'applewatch' } },
];

/** ASHA: Babies · Visits · Alerts · Register · Profile */
export const ashaTabs: TabDef[] = [
  { name: 'index', href: '/asha', label: 'nav.babies', icon: { md: 'child_care', sf: 'face.smiling' } },
  { name: 'visits', href: '/asha/visits', label: 'nav.visits', icon: { md: 'event', sf: 'calendar' } },
  { name: 'alerts', href: '/asha/alerts', label: 'nav.alerts', icon: { md: 'notifications_active', sf: 'bell.badge.fill' } },
  { name: 'register', href: '/asha/register', label: 'nav.register', icon: { md: 'person_add', sf: 'person.badge.plus' } },
  { name: 'profile', href: '/asha/profile', label: 'nav.profile', icon: { md: 'person', sf: 'person.crop.circle' } },
];

/** Doctor: Dashboard · Patients · Alerts · Notes · Profile */
export const doctorTabs: TabDef[] = [
  { name: 'index', href: '/doctor', label: 'nav.dashboard', icon: { md: 'dashboard', sf: 'square.grid.2x2.fill' } },
  { name: 'patients', href: '/doctor/patients', label: 'nav.patients', icon: { md: 'groups', sf: 'person.2.fill' } },
  { name: 'alerts', href: '/doctor/alerts', label: 'nav.alerts', icon: { md: 'notifications_active', sf: 'bell.badge.fill' } },
  { name: 'notes', href: '/doctor/notes', label: 'nav.notes', icon: { md: 'description', sf: 'doc.text.fill' } },
  { name: 'profile', href: '/doctor/profile', label: 'nav.profile', icon: { md: 'person', sf: 'person.crop.circle' } },
];
