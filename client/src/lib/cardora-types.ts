import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type CardoraOutputs = inferRouterOutputs<AppRouter>;
export type DashboardData = CardoraOutputs["cardora"]["dashboard"];
export type CollectionList = DashboardData["collections"];
export type DashboardProfile = DashboardData["profile"];
