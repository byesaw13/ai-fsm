import { brandingContactLines, type ResolvedCompanyBranding } from "@/lib/company/branding";

interface Props {
  branding: ResolvedCompanyBranding;
  /** Account logo URL, or null when no logo is uploaded. */
  logoSrc: string | null;
}

const muted = { color: "#57534e", margin: "2px 0 0" } as const;

/**
 * Company letterhead on the invoice and quote print pages. A wordmark logo
 * already carries the name, so the name line is left out and the contact
 * lines sit under it (TASK-226).
 */
export function Letterhead({ branding, logoSrc }: Props) {
  const wordmark = !!logoSrc && branding.logoIsWordmark;
  const contactLines = brandingContactLines(branding);
  return (
    <div style={{ display: "flex", flexDirection: wordmark ? "column" : "row", gap: wordmark ? 8 : 16, alignItems: "flex-start" }}>
      {logoSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt={wordmark ? branding.name : ""}
          style={{ maxHeight: wordmark ? 68 : 56, maxWidth: wordmark ? 260 : 160, objectFit: "contain" }}
        />
      )}
      <div>
        {!wordmark && <div style={{ fontSize: 20, fontWeight: 700, color: "#c1540f" }}>{branding.name}</div>}
        {branding.tagline && <p style={{ ...muted, fontSize: 13 }}>{branding.tagline}</p>}
        {contactLines.map((line) => (
          <p key={line} style={{ ...muted, fontSize: 12 }}>{line}</p>
        ))}
      </div>
    </div>
  );
}
