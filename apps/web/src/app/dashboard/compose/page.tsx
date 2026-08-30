"use client";

import dynamic from "next/dynamic";
import { useIsMobile } from "@/hooks/use-mobile";
import { useComposeOrchestration } from "@/hooks/use-compose-orchestration";

const ComposeClient = dynamic(() => import("./compose-client").then((m) => ({ default: m.ComposeClient })), { ssr: false });
const ComposeMobile = dynamic(() => import("./compose-mobile"), { ssr: false });

export default function ComposePage() {
    const isMobile = useIsMobile();
    const orch = useComposeOrchestration();

    if (isMobile) {
        return <ComposeMobile orch={orch} />;
    }

    return <ComposeClient orch={orch} />;
}
