import type { UserRole } from "./auth.types";

export interface NavItemConfig {
  label: string;
  path: string;
  roles: UserRole[];
}
