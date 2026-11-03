import Link from "next/link";

import { Logo } from "@/components/Logo";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <Logo height={64} />
      <h1 className={styles.title}>हर नवजात को गर्म और सुरक्षित रखें</h1>
      <p className={styles.lead}>
        Keep every newborn warm and safe. The NeoBridge band watches a baby&apos;s warmth at home
        and tells the family, their ASHA and the doctor what to do next.
      </p>
      <Link className={styles.cta} href="/login">
        लॉग इन · Log in
      </Link>
    </main>
  );
}
