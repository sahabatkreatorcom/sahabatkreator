import type { ReplizDMAutoReplyRule } from "./adapters/repliz/client";
import { ReplizDMClient } from "./adapters/repliz/client";

export interface DMAutoReplyConfig {
  platform: string;
  type: "keyword" | "ai" | "text";
  keywords?: string[];
  replyText?: string;
  aiPrompt?: string;
  delayMs?: number;
  exceptionKeywords?: string[];
  isActive: boolean;
}

export interface DMAutoReplyResult {
  success: boolean;
  ruleId?: string;
  error?: string;
}

export class DMAutoReplyManager {
  private client: ReplizDMClient;

  constructor(accessKey: string, secretKey: string, apiUrl?: string) {
    this.client = new ReplizDMClient(accessKey, secretKey, apiUrl);
  }

  async getRules(platform: string): Promise<ReplizDMAutoReplyRule[]> {
    try {
      return await this.client.getAutoReplyRules(platform);
    } catch (e) {
      console.error("[dm-auto-reply] getRules error:", e);
      return [];
    }
  }

  async createRule(config: DMAutoReplyConfig): Promise<DMAutoReplyResult> {
    try {
      const rule = await this.client.createAutoReplyRule({
        platform: config.platform,
        type: config.type,
        keywords: config.keywords,
        reply_text: config.replyText,
        ai_prompt: config.aiPrompt,
        delay_ms: config.delayMs,
        exception_keywords: config.exceptionKeywords,
      });
      return { success: true, ruleId: rule.rule_id };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Failed to create DM auto-reply rule",
      };
    }
  }

  async updateRule(
    ruleId: string,
    updates: Partial<DMAutoReplyConfig>,
  ): Promise<DMAutoReplyResult> {
    try {
      await this.client.updateAutoReplyRule(ruleId, {
        type: updates.type,
        keywords: updates.keywords,
        reply_text: updates.replyText,
        ai_prompt: updates.aiPrompt,
        is_active: updates.isActive,
        delay_ms: updates.delayMs,
        exception_keywords: updates.exceptionKeywords,
      });
      return { success: true, ruleId };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Failed to update DM auto-reply rule",
      };
    }
  }

  async deleteRule(ruleId: string): Promise<DMAutoReplyResult> {
    try {
      await this.client.deleteAutoReplyRule(ruleId);
      return { success: true, ruleId };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Failed to delete DM auto-reply rule",
      };
    }
  }

  async toggleRule(
    ruleId: string,
    isActive: boolean,
  ): Promise<DMAutoReplyResult> {
    try {
      await this.client.updateAutoReplyRule(ruleId, { is_active: isActive });
      return { success: true, ruleId };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Failed to toggle DM auto-reply rule",
      };
    }
  }

  async sendCommentToDM(
    commentId: string,
    userId: string,
    text: string,
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> {
    try {
      const result = await this.client.sendCommentToDM(commentId, userId, text);
      return {
        success: result.success,
        conversationId: result.conversation_id,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Failed to send comment to DM",
      };
    }
  }
}
