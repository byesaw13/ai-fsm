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

export function IconSchedule(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="16" height="14" rx="2" />
      <path d="M14 2v4M6 2v4M2 9h16" />
      <path d="M6 13h2M10 13h4M6 16h3" />
    </Icon>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" />
    </Icon>
  );
}

export function IconPriceBook(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="16" height="16" rx="2" />
      <path d="M2 6h16" />
      <path d="M6 2v4" />
      <path d="M7 10h3M7 13h6" />
    </Icon>
  );
}

export function IconMyDay(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l-1.6 1.6a1 1 0 0 0 1.4 1.4l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </Icon>
  );
}

export function IconQueue(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5h10M5 10h10M5 15h6" />
      <path d="m2.5 5 1 1 2-2M2.5 10l1 1 2-2M2.5 15l1 1 2-2" />
    </Icon>
  );
}

export function IconMileage(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </Icon>
  );
}

export function IconBooking(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="14" height="14" rx="2" />
      <path d="M3 9h14M8 4v2M12 4v2" />
    </Icon>
  );
}

export function IconPipeline(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="4" height="12" rx="1" />
      <rect x="8" y="6" width="4" height="10" rx="1" />
      <rect x="14" y="2" width="4" height="14" rx="1" />
    </Icon>
  );
}

export function IconField(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6Z" />
      <circle cx="10" cy="8" r="2" />
    </Icon>
  );
}

export function IconMembership(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 10a8 8 0 0 1 13-6.24M18 10a8 8 0 0 1-13 6.24" />
      <path d="M15 3.76V7h-3M5 16.24V13h3" />
    </Icon>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <Icon {...props}>
      <polyline points="2 12 6 12 8 4 12 18 14 9 16 12 18 12" />
    </Icon>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
    </Icon>
  );
}

export function IconPortal(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="5" width="16" height="12" rx="2" />
      <path d="M7 5V4a3 3 0 016 0v1" />
      <circle cx="10" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10 12.5v2" />
    </Icon>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8l7-5 7 5" />
      <path d="M3 8v9a2 2 0 002 2h10a2 2 0 002-2V8" />
      <path d="M3 14h4l1.5 2h3L13 14h4" />
    </Icon>
  );
}

export function IconDayReview(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 10l2 2 4-4" />
    </Icon>
  );
}
