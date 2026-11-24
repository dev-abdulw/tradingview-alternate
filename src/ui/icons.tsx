/**
 * Domain icons lucide doesn't cover precisely (chart types, drawing tools,
 * layouts). 16px grid, 1.5 stroke, currentColor — match lucide's weight.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const LogoMark = (p: IconProps) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <rect x="2" y="9" width="4" height="7" rx="1" fill="currentColor" opacity="0.45" />
    <rect x="8" y="5" width="4" height="11" rx="1" fill="currentColor" opacity="0.7" />
    <rect x="14" y="2" width="4" height="14" rx="1" fill="currentColor" />
  </svg>
);

export const CandlesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 2v2M4.5 11v3M11.5 2v3M11.5 12v2" />
    <rect x="3" y="4" width="3" height="7" rx="0.5" fill="currentColor" />
    <rect x="10" y="5" width="3" height="7" rx="0.5" fill="currentColor" />
  </Svg>
);

export const HollowCandlesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 2v2M4.5 11v3M11.5 2v3M11.5 12v2" />
    <rect x="3" y="4" width="3" height="7" rx="0.5" />
    <rect x="10" y="5" width="3" height="7" rx="0.5" fill="currentColor" />
  </Svg>
);

export const BarsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.5v10M3 5h2M5 10h2M11 4v10M9 6h2M11 12h2" />
  </Svg>
);

export const LineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 12l4-4.5 3 2.5 6-7" />
  </Svg>
);

export const AreaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 14V11l4-4.5 3 2.5 6-6V14z" fill="currentColor" fillOpacity={0.25} />
    <path d="M1.5 11l4-4.5 3 2.5 6-6" />
  </Svg>
);

export const HeikinAshiIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 3v2M3.5 9v3M8 2v2M8 9v2M12.5 4v2M12.5 11v3" />
    <rect x="2" y="5" width="3" height="4" rx="0.5" fill="currentColor" />
    <rect x="6.5" y="4" width="3" height="5" rx="0.5" fill="currentColor" />
    <rect x="11" y="6" width="3" height="5" rx="0.5" />
  </Svg>
);

export const TrendLineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12.5l9-9" />
    <circle cx="3" cy="13" r="1.5" />
    <circle cx="13" cy="3" r="1.5" />
  </Svg>
);

export const RayIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="3" cy="13" r="1.5" />
    <path d="M4.2 11.8L14.5 1.5" />
    <path d="M11 1.5h3.5V5" />
  </Svg>
);

export const HorizontalLineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8h13" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
  </Svg>
);

export const RectangleToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="11" height="8" rx="0.5" />
    <circle cx="2.5" cy="4" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="13.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const FibIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 2.5h13M1.5 6h13M1.5 9h13M1.5 13.5h13" />
    <path d="M3 13.5L13 2.5" strokeDasharray="1.5 1.5" />
  </Svg>
);

export const Layout1Icon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
  </Svg>
);

export const Layout2Icon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M8 2.5v11" />
  </Svg>
);

export const Layout4Icon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M8 2.5v11M2 8h12" />
  </Svg>
);
