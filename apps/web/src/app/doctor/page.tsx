import type { Metadata } from "next";

import { BandStatus } from "@neobridge/ble-protocol";
import { demoClinicianSummary as summary } from "@neobridge/demo";

import { DashboardShell } from "@/components/DashboardShell";
import styles from "@/components/dashboard.module.css";
import { StatusShape } from "@/components/StatusShape";

export const metadata: Metadata = { title: "Doctor" };

// Figma: Doctor · summary and trends. Numbers are shown here, never to families.
// TODO: trends chart (wrist skin, room, heart rate, status strip) and PDF export.
export default function DoctorDashboard() {
  return (
    <DashboardShell role="doctor">
      <section className={styles.card}>
        <h1 className={styles.pageTitle}>{summary.title}</h1>
        <p className={styles.sub}>{summary.details}</p>
        <div className={styles.banner}>
          <StatusShape status={BandStatus.Red} size={32} />
          <div className={styles.rowText}>
            <span className={styles.bannerTitle}>{summary.banner}</span>
            <span>{summary.bannerDetail}</span>
          </div>
        </div>
      </section>

      <div className={styles.grid}>
        {summary.stats.map((s) => (
          <section key={s.label} className={styles.card}>
            <span className={styles.sub}>{s.label}</span>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.sub}>{s.note}</span>
          </section>
        ))}
      </div>

      <section className={styles.card}>
        <h2>Alerts and actions</h2>
        <ul className={styles.list} style={{ listStyle: "none" }}>
          {summary.alerts.map((a) => (
            <li key={a.time} className={styles.row}>
              <StatusShape status={a.status} />
              <span className={styles.sub} style={{ minWidth: 110 }}>
                {a.time}
              </span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.sub}>
        This summary supports clinical judgement; it does not diagnose. Wrist skin temperature is
        not core temperature. All values are sample data.
      </p>
    </DashboardShell>
  );
}
