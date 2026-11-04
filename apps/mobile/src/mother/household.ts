import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { AMBULANCE } from '@neobridge/demo';
import { istDate, type BabyDetail, type BabyInfo, type MotherInfo } from '@neobridge/domain';

import { useApi } from '@/api/cache';
import { useSession } from '@/session';
import { useNow } from '@/use-now';

/** The mother's own household: her record, the baby, and the baby's detail (cached for offline). */
export function useHousehold(): {
  mother: MotherInfo | null;
  baby: BabyInfo | null;
  detail: BabyDetail | null;
  refresh: () => Promise<void>;
  phones: { asha: string | null; ashaName: string; transport: string; facility: string | null; facilityName: string | null };
} {
  const { me } = useSession();
  const mother = me?.mother ?? null;
  const baby = me?.babies?.[0] ?? null;
  const q = useApi<BabyDetail>(baby ? `/v1/babies/${baby.id}` : null, { pollMs: 60_000 });
  const facility = q.data?.baby.facility ?? baby?.facility ?? mother?.deliveryFacility ?? null;
  return {
    mother,
    baby: q.data?.baby ?? baby,
    detail: q.data,
    refresh: q.refresh,
    phones: {
      asha: mother?.asha?.phone ?? null,
      ashaName: mother?.asha?.name.split(' ')[0] ?? 'ASHA',
      transport: AMBULANCE,
      facility: facility?.phone ?? null,
      facilityName: facility?.name ?? null,
    },
  };
}

// ---- daily danger-sign check (M3) -------------------------------------------------

const DANGER_KEY = 'neobridge.dangerCheck';
interface LastCheck {
  date: string;
  anyYes: boolean;
}
let lastCheck: LastCheck | null = null;
const checkListeners = new Set<() => void>();
void AsyncStorage.getItem(DANGER_KEY)
  .then((raw) => {
    lastCheck = raw ? (JSON.parse(raw) as LastCheck) : null;
    checkListeners.forEach((l) => l());
  })
  .catch(() => undefined);

export function saveDangerCheck(anyYes: boolean) {
  lastCheck = { date: istDate(Date.now()), anyYes };
  void AsyncStorage.setItem(DANGER_KEY, JSON.stringify(lastCheck)).catch(() => undefined);
  checkListeners.forEach((l) => l());
}

/** Whether today's check is done. */
export function useDangerCheckDone(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    checkListeners.add(l);
    return () => {
      checkListeners.delete(l);
    };
  }, []);
  return lastCheck?.date === istDate(useNow(60_000));
}
