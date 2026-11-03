"use client";

import { BandStatus } from "@neobridge/ble-protocol";
import { demoAshaName, demoBabies, demoMotherBabyId, demoPhone, telHref } from "@neobridge/demo";
import { bi, pick, t } from "@neobridge/i18n";

import { Bi } from "@/components/Bi";
import { DashboardShell } from "@/components/DashboardShell";
import styles from "@/components/dashboard.module.css";
import { StatusShape } from "@/components/StatusShape";

// Caregiver home (Figma: Home · four states). Families never see numbers.
export function MotherView() {
  const baby = demoBabies.find((b) => b.id === demoMotherBabyId)!;

  return (
    <DashboardShell role="mother">
      {(lang) => (
        <>
          <h1 className={styles.pageTitle}>{pick(lang, baby.name)}</h1>
          <p className={styles.sub}>{t(lang, "band.linkedAgo", { ago: baby.lastSync })}</p>

          <section className={styles.banner} style={{ background: "var(--red)", color: "#fff" }}>
            <span className={styles.shapeOnColour}>
              <StatusShape status={BandStatus.Red} size={44} />
            </span>
            <div className={styles.rowText}>
              <Bi value={bi(lang, "status.red.title")} className={styles.callTitle} />
            </div>
          </section>

          <a className={styles.callButton} href={telHref(demoPhone.asha)}>
            <Bi
              value={bi(lang, "call.asha", { name: demoAshaName })}
              className={styles.callTitle}
              glossClassName={styles.callSub}
            />
          </a>
          <a
            className={styles.callButton}
            href={telHref(demoPhone.transport)}
            style={{ background: "var(--red-text)" }}>
            <Bi
              value={bi(lang, "status.red.fallback")}
              className={styles.callTitle}
              glossClassName={styles.callSub}
            />
          </a>

          <section className={styles.card}>
            <Bi
              value={bi(lang, "status.red.skinToSkin")}
              className={styles.rowTitle}
              glossClassName={styles.sub}
            />
          </section>
        </>
      )}
    </DashboardShell>
  );
}
