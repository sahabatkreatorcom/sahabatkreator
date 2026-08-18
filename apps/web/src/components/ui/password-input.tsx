"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PasswordInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
    function PasswordInput({ className, ...props }, ref) {
        const [visible, setVisible] = React.useState(false);
        return (
            <div className="relative">
                <Input
                    ref={ref}
                    type={visible ? "text" : "password"}
                    className={cn("pr-10", className)}
                    {...props}
                />
                <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "Sembunyikan password" : "Lihat password"}
                    aria-pressed={visible}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        );
    }
);