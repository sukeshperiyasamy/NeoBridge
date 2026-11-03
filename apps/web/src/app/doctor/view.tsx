"use client";

import { BandStatus } from "@neobridge/ble-protocol";
import { demoClinicianSummary as summary } from "@neobridge/demo";
import { pick, t } from "@neobridge/i18n";

import { DashboardShell } from "@/components/DashboardShell";
import styles from "@/components/dashboard.module.css";
import { StatusShape, statusLabelKey } from "@/components/StatusShape";

// Figma: Doctor · summary and trends. Numbers are shown here, never to families.
// TODO: trends chart (wrist skin, room, heart rate, status strip) and PDF export.
export function DoctorView() {
  return (
    <DashboardShell role="doctor">
      {(lang) => (
        <>
          <section className={styles.card}>
            <h1 className={styles.pageTitle}>{pick(lang, summary.title)}</h1>
            <p className={styles.sub}>{pick(lang, summary.details)}</p>
            <div className={styles.banner}>
              <StatusShape status={BandStatus.Red} size={32} label={t(lang, "status.label.red")} />
              <div className={styles.rowText}>
                <span className={styles.bannerTitle}>{pick(lang, summary.banner)}</span>
                <span>{pick(lang, summary.bannerDetail)}</span>
              </div>
            </div>
          </section>

          <div className={styles.grid}>
            {summary.stats.map((s) => (
              <section key={s.label.en} className={styles.card}>
                <span className={styles.sub}>{pick(lang, s.label)}</span>
                <span className={styles.statValue}>{pick(lang, s.value)}</span>
                <span className={styles.sub}>{pick(lang, s.note)}</span>
              </section>
            ))}
          </div>

          <section className={styles.card}>
            <h2>{t(lang, "doctor.alerts")}</h2>
            <ul className={styles.list} style={{ listStyle: "none" }}>
              {summary.alerts.map((a) => (
                <li key={a.id} className={styles.row}>
                  <StatusShape status={a.status} label={t(lang, statusLabelKey[a.status])} />
                  <span className={styles.sub} style={{ minWidth: 110 }}>
                    {pick(lang, a.time)}
                  </span>
                  <span>{pick(lang, a.text)}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className={styles.sub}>{t(lang, "doctor.disclaimer")}</p>
        </>
      )}
    </DashboardShell>
  );
}
