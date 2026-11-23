import { ChartColumn, GraduationCap, LayoutGrid, MapPinned, School, UserRound, type LucideIcon } from "lucide-react";

import type { NavigationIcon } from "@/lib/navigation";

/** Icons for the top-level navigation sections, shared by the sidebar and the header. */
export const navigationIcons: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutGrid,
  map: MapPinned,
  admission: School,
  analytics: ChartColumn,
  recommendation: GraduationCap,
  users: UserRound,
};
