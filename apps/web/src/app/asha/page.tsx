import type { Metadata } from "next";

import { BandStatus } from "@neobridge/ble-protocol";
import { demoBabies } from "@neobridge/demo";

import { DashboardShell } from "@/components/DashboardShell";
import styles from "@/components/dashboard.module.css";
import { StatusShape, statusLabel } from "@/components/StatusShape";

export const metadata: Metadata = { title: "ASHA" };

// Red first, then yellow, grey, green (Figma: ASHA · My babies).
const order = [BandStatus.Red, BandStatus.Yellow, BandStatus.Grey, BandStatus.Green];

export default function AshaDashboard() {
  const babies = [...demoBabies].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const counts = order.map((s) => ({ s, n: demoBabies.filter((b) => b.status === s).length }));

  return (
    <DashboardShell role="asha">
      <h1 className={styles.pageTitle}>मेरे शिशु</h1>
      <p className={styles.sub}>My babies · red first · synced 2 min ago</p>

      <div className={styles.row}>
        {counts.map(({ s, n }) => (
          <span key={s} className={styles.row} style={{ gap: 6 }}>
            <StatusShape status={s} />
            <strong>{n}</strong>
            <span className={styles.sub}>{statusLabel[s].english}</span>
          </span>
        ))}
      </div>

      <ul className={styles.list} style={{ listStyle: "none" }}>
        {babies.map((b) => (
          <li
            key={b.id}
            className={[
              styles.listItem,
              b.status === BandStatus.Red && styles.listItemRed,
              b.status === BandStatus.Yellow && styles.listItemYellow,
            ]
              .filter(Boolean)
              .join(" ")}>
            <StatusShape status={b.status} size={32} />
            <div className={styles.rowText}>
              <span className={styles.rowTitle}>
                {b.nameLocal} <span className={styles.sub}>{b.village} · दिन {b.dayOfLife}</span>
              </span>
              <span className={styles.sub}>
                {b.name} · {b.note}
              </span>
            </div>
            <span className={styles.sub}>{b.lastSync}</span>
          </li>
        ))}
      </ul>
    </DashboardShell>
  );
}
