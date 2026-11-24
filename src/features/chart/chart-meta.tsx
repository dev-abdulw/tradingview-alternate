import type { ReactNode } from "react";
import {
  AreaIcon,
  BarsIcon,
  CandlesIcon,
  HeikinAshiIcon,
  HollowCandlesIcon,
  Layout1Icon,
  Layout2Icon,
  Layout4Icon,
  LineIcon,
} from "@/ui/icons";
import type { ChartType, LayoutMode } from "./chart-store";

export const CHART_TYPE_META: Record<ChartType, { label: string; icon: ReactNode }> = {
  candles: { label: "Candles", icon: <CandlesIcon /> },
  hollow: { label: "Hollow candles", icon: <HollowCandlesIcon /> },
  bars: { label: "Bars", icon: <BarsIcon /> },
  line: { label: "Line", icon: <LineIcon /> },
  area: { label: "Area", icon: <AreaIcon /> },
  "heikin-ashi": { label: "Heikin-Ashi", icon: <HeikinAshiIcon /> },
};

export const LAYOUT_META: Record<LayoutMode, { label: string; icon: ReactNode }> = {
  "1": { label: "Single chart", icon: <Layout1Icon /> },
  "2h": { label: "2 charts, side by side", icon: <Layout2Icon /> },
  "2x2": { label: "4 charts, 2×2 grid", icon: <Layout4Icon /> },
};
