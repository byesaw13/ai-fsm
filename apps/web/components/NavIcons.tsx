import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="7" height="7" rx="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function IconJobs(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 2h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
      <path d="M7.5 7h5M7.5 10h5M7.5 13h3" />
      <path d="M8 2v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2" />
    </Icon>
  );
}

export function IconVisits(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="16" height="14" rx="2" />
      <path d="M14 2v4M6 2v4M2 9h16" />
      <path d="M6 13h2M10 13h2M6 16h2" />
    </Icon>
  );
}

export function IconClients(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="7" r="3" />
      <path d="M2 18c0-3.3 2.7-6 6-6" />
      <circle cx="14" cy="8" r="2.5" />
      <path d="M18 18c0-2.8-1.8-5-4-5.5" />
    </Icon>
  );
}

export function IconInvoices(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="2" width="14" height="16" rx="1.5" />
      <path d="M7 7h6M7 10h6M7 13h4" />
      <path d="M10 5V3M10 17v-2" />
    </Icon>
  );
}

export function IconEstimates(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 3h9l4 4v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M13 3v4h4" />
      <path d="M7 10h6M7 13h4" />
    </Icon>
  );
}

export function IconProperties(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9.5 10 3l7 6.5" />
      <path d="M5 9v8a1 1 0 0 0 1 1h3v-4h2v4h3a1 1 0 0 0 1-1V9" />
    </Icon>
  );
}

export function IconExpenses(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="5" width="16" height="12" rx="2" />
      <circle cx="10" cy="11" r="2.5" />
      <path d="M6 5V3M14 5V3" />
    </Icon>
  );
}

export function IconAutomations(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
    </Icon>
  );
}

export function IconReports(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="16" height="16" rx="2" />
      <path d="M6 14V9M10 14V6M14 14v-4" />
    </Icon>
  );
}
