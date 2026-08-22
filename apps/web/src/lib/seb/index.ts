/**
 * Seb Advisor — unified barrel export.
 *
 * Modules:
 *  - types.ts           → constants & interfaces
 *  - context-collector.ts  → collectContext()
 *  - report-generation.ts  → generateSebReport, list/get/report helpers
 *  - chat.ts             → chatWithSeb, session helpers
 *  - brand-knowledge.ts  → brand knowledge queries + website scanner
 *  - media-analysis.ts   → list/analyze media for Seb visual insights
 */

export {
    DEFAULT_SEB_PROMPT,
    PLATFORM_KNOWLEDGE,
    type ReportTrigger,
    type SebAdviceResponse,
    type SebContext,
    type GenerateSebReportOptions,
} from "./types";

export { collectContext } from "./context-collector";

export {
    generateSebReport,
    listSebReports,
    getSebReport,
    listSebRecommendations,
    updateSebRecommendation,
} from "./report-generation";

export {
    chatWithSeb,
    listSebSessions,
    getSebSessionMessages,
} from "./chat";

export {
    getBrandKnowledge,
    updateBrandKnowledge,
    scanWebsiteForBrandKnowledge,
    normalizeSebTimezone,
} from "./brand-knowledge";

export {
    listAnalyzableMedia,
    analyzeMediaForSeb,
} from "./media-analysis";
