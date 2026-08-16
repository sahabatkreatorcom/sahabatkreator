import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
    /** Ukuran dalam px (persegi). Default 32 */
    size?: number;
    className?: string;
}

export function Logo({ size = 32, className }: LogoProps) {
    return (
        <Image
            src="/logo-sahabat-kreator.png"
            alt="Sahabat Kreator"
            width={size}
            height={size}
            className={cn("shrink-0 rounded-md object-contain", className)}
            priority
        />
    );
}