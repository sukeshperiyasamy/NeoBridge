import type { Metadata } from "next";

import { BandStatus } from "@neobridge/ble-protocol";
import { demoBabies, demoMotherBabyId } from "@neobridge/demo";
import { t } from "@neobridge/i18n";

import { DashboardShell } from "@/components/DashboardShell";
import styles from "@/components/dashboard.module.css";
import { StatusShape } from "@/components/StatusShape";

export const metadata: Metadata = { title: "Mother" };

// Caregiver home (Figma: Home · four states). Families never see numbers.
export default function MotherDashboard() {
  const baby = demoBabies.find((b) => b.id === demoMotherBabyId)!;
  const title = t("hi", "status.red.title");
  const fallback = t("hi", "status.red.fallback");
  const call = t("hi", "call.asha", { name: "सुनीता", nameEn: "Sunita" });

  return (
    <DashboardShell role="mother">
      <h1 className={styles.pageTitle}>{baby.nameLocal}</h1>
      <p className={styles.sub}>
        {baby.name} · बैंड जुड़ा है · Band linked, checked {baby.lastSync}
      </p>

      <section className={styles.banner} style={{ background: "var(--red)", color: "#fff" }}>
        <span className={styles.shapeOnColour}>
          <StatusShape status={BandStatus.Red} size={44} />
        </span>
        <div className={styles.rowText}>
          <span className={styles.callTitle}>{title.local.text}</span>
          <span>{title.english}</span>
        </div>
      </section>

      <a className={styles.callButton} href="tel:">
        <span className={styles.callTitle}>{call.local.text}</span>
        <span className={styles.callSub}>{call.english}</span>
      </a>
      <a className={styles.callButton} href="tel:102" style={{ background: "var(--red-text)" }}>
        <span className={styles.callTitle}>{fallback.local.text}</span>
        <span className={styles.callSub}>{fallback.english}</span>
      </a>

      <section className={styles.card}>
        <span className={styles.rowTitle}>तब तक बच्चे को सीने से चिपकाए रखें</span>
        <span className={styles.sub}>Meanwhile, keep baby skin to skin</span>
      </section>
    </DashboardShell>
  );
}
