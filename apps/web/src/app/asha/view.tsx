"use client";

import { BandStatus } from "@neobridge/ble-protocol";
import { demoBabies, demoPhone, telHref } from "@neobridge/demo";
import { pick, t } from "@neobridge/i18n";

import { PhoneIcon } from "@/components/PhoneIcon";
import { DashboardShell } from "@/components/DashboardShell";
import styles from "@/components/dashboard.module.css";
import { StatusShape, statusLabelKey } from "@/components/StatusShape";

// Red first, then yellow, grey, green (Figma: ASHA · My babies).
const order = [BandStatus.Red, BandStatus.Yellow, BandStatus.Grey, BandStatus.Green];
const babies = [...demoBabies].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

export function AshaView() {
  return (
    <DashboardShell role="asha">
      {(lang) => (
        <>
          <h1 className={styles.pageTitle}>{t(lang, "asha.title")}</h1>
          <p className={styles.sub}>
            {t(lang, "asha.sub", { ago: { en: "2 min ago", hi: "2 मि. पहले" } })}
          </p>

          <div className={styles.counts}>
            {order.map((s) => (
              <span key={s} className={styles.row} style={{ gap: 6 }}>
                <StatusShape status={s} />
                <strong>{demoBabies.filter((b) => b.status === s).length}</strong>
                <span className={styles.sub}>{t(lang, statusLabelKey[s])}</span>
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
                <StatusShape status={b.status} size={32} label={t(lang, statusLabelKey[b.status])} />
                <div className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    {pick(lang, b.name)}{" "}
                    <span className={styles.sub}>
                      {pick(lang, b.village)} · {t(lang, "day", { n: b.dayOfLife })}
                    </span>
                  </span>
                  <span className={styles.sub}>
                    {pick(lang, b.note)} · {pick(lang, b.lastSync)}
                  </span>
                </div>
                <a
                  className={styles.callIcon}
                  href={telHref(demoPhone.family)}
                  aria-label={`${t(lang, "call.family")} · ${pick(lang, b.name)}`}>
                  <PhoneIcon />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardShell>
  );
}
