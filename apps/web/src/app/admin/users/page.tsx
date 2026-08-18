"use client";

import * as React from "react";
import { UsersTable } from "@/components/admin/users-table";

export default function AdminUsersPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-lg font-semibold">Kelola User</h1>
                <p className="text-sm text-muted-foreground">Manajemen semua akun pengguna</p>
            </div>
            <UsersTable />
        </div>
    );
}
