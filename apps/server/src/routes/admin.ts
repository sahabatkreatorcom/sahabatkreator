// API Admin — statistik platform, user & org management, plans, credentials, settings

import { Hono } from "hono";
import { adminBillingRoute } from "./admin-billing";
import { adminConfigRoute } from "./admin-config";
import { adminHolidaysRoute } from "./admin-holidays";
import { adminUsersRoute } from "./admin-users";

export const adminRoute = new Hono();

adminRoute.route("/", adminUsersRoute);
adminRoute.route("/", adminConfigRoute);
adminRoute.route("/", adminBillingRoute);
adminRoute.route("/", adminHolidaysRoute);
