// Guard admin — hanya user dengan role "admin" (platform admin)
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router";
import { PageLoader } from "@/components/ui/spinner";
import { meQueryOptions } from "./require-auth";

export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { data, isLoading, isError } = useQuery(meQueryOptions);

  if (isLoading) return <PageLoader />;

  if (isError || !data?.authenticated || data.user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
