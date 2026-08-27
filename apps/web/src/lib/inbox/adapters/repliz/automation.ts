import type { ReplizAutomationRule } from "./client";
import { ReplizInboxClient } from "./client";

export interface ReplizAutomationConfig {
  platform: string;
  type: "keyword" | "ai" | "text";
  keywords?: string[];
  replyText?: string;
  aiPrompt?: string;
  isActive: boolean;
}

export interface ReplizAutomationResult {
  success: boolean;
  ruleId?: string;
  error?: string;
}

export class ReplizAutomationManager {
  private client: ReplizInboxClient;

  constructor(accessKey: string, secretKey: string, apiUrl?: string) {
    this.client = new ReplizInboxClient(accessKey, secretKey, apiUrl);
  }

  async getRules(platform: string): Promise<ReplizAutomationRule[]> {
    try {
      return await this.client.getAutomationRules(platform);
    } catch (e) {
      console.error("[repliz-automation] getRules error:", e);
      return [];
    }
  }

  async createRule(
    config: ReplizAutomationConfig,
  ): Promise<ReplizAutomationResult> {
    try {
      const rule = await this.client.createAutomationRule({
        platform: config.platform,
        type: config.type,
        keywords: config.keywords,
        reply_text: config.replyText,
        ai_prompt: config.aiPrompt,
      });
      return { success: true, ruleId: rule.rule_id };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error ? e.message : "Failed to create automation rule",
      };
    }
  }

  async updateRule(
    ruleId: string,
    updates: Partial<ReplizAutomationConfig>,
  ): Promise<ReplizAutomationResult> {
    try {
      await this.client.updateAutomationRule(ruleId, {
        type: updates.type,
        keywords: updates.keywords,
        reply_text: updates.replyText,
        ai_prompt: updates.aiPrompt,
        is_active: updates.isActive,
      });
      return { success: true, ruleId };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error ? e.message : "Failed to update automation rule",
      };
    }
  }

  async deleteRule(ruleId: string): Promise<ReplizAutomationResult> {
    try {
      await this.client.deleteAutomationRule(ruleId);
      return { success: true, ruleId };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error ? e.message : "Failed to delete automation rule",
      };
    }
  }

  async toggleRule(
    ruleId: string,
    isActive: boolean,
  ): Promise<ReplizAutomationResult> {
    try {
      await this.client.updateAutomationRule(ruleId, { is_active: isActive });
      return { success: true, ruleId };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error ? e.message : "Failed to toggle automation rule",
      };
    }
  }

  async syncLocalToRepliz(
    localRules: Array<{
      id: string;
      platform: string;
      trigger: string;
      message: string;
      isActive: boolean;
    }>,
  ): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    for (const rule of localRules) {
      try {
        const keywords = rule.trigger
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);

        await this.client.createAutomationRule({
          platform: rule.platform,
          type: "keyword",
          keywords,
          reply_text: rule.message,
        });
        synced++;
      } catch (e) {
        errors.push(
          `Failed to sync rule ${rule.id}: ${e instanceof Error ? e.message : "unknown error"}`,
        );
      }
    }

    return { synced, errors };
  }
}
