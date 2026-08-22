// ============================================================================
// Seb Advisor — Re-export all public API from split modules
// ============================================================================
// This file preserves backward compatibility for any code importing from
// "@/lib/seb-advisor". The implementation has been split into smaller,
// maintainable modules under src/lib/seb/.
// ============================================================================

export {
    // types
    DEFAULT_SEB_PROMPT,
    PLATFORM_KNOWLEDGE,
    type ReportTrigger,
    type SebAdviceResponse,
    type SebContext,
    type GenerateSebReportOptions,
} from "./seb/types";

export { collectContext } from "./seb/context-collector";

export {
    generateSebReport,
    listSebReports,
    getSebReport,
    listSebRecommendations,
    updateSebRecommendation,
} from "./seb/report-generation";

export {
    chatWithSeb,
    listSebSessions,
    getSebSessionMessages,
} from "./seb/chat";

export {
    getBrandKnowledge,
    updateBrandKnowledge,
    scanWebsiteForBrandKnowledge,
    normalizeSebTimezone,
} from "./seb/brand-knowledge";

export {
    listAnalyzableMedia,
    analyzeMediaForSeb,
} from "./seb/media-analysis";
