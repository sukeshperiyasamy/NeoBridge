import type { Bilingual } from "@neobridge/i18n";

/** A line in the chosen language, with its English gloss beneath when there is one. */
export function Bi({
  value,
  className,
  glossClassName,
}: {
  value: Bilingual;
  className?: string;
  glossClassName?: string;
}) {
  return (
    <>
      <span className={className}>{value.text}</span>
      {value.gloss && <span className={glossClassName}>{value.gloss}</span>}
    </>
  );
}
