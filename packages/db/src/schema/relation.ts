import { relations } from "drizzle-orm";
import { account, invitation, member, organization, session, team, teamMember, twoFactor, user } from "./auth";
import { socialAccount, pinterestBoardCache, audienceActivity } from "./social";
import { post, postMedia, postHashtag, postProduct, publishError } from "./post";
import { media, mediaFolder, stockMediaImport } from "./media";
import { comment, review, mention, directMessage, automation, activity } from "./engagement";
import {
  competitor,
  competitorPost,
  product,
  productCatalog,
  productTag,
  shopConnection,
} from "./commerce";
import { platformAnalytics, postAnalytics, dailyAnalyticsSnapshot, scheduledReport } from "./analytics";
import { captionTemplate, contentPillar, hashtagCollection, draftInteraction, engagementPrediction } from "./content";
import {
  sebReport,
  sebRecommendation,
  sebChatSession,
  sebChatMessage,
  sebMediaAnalysis,
  sebExperiment,
} from "./seb";
import { payment, subscription } from "./payment";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  twoFactors: many(twoFactor),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  teams: many(team),
  socialAccounts: many(socialAccount),
  posts: many(post),
  media: many(media),
  mediaFolders: many(mediaFolder),
  contentPillars: many(contentPillar),
  captionTemplates: many(captionTemplate),
  hashtagCollections: many(hashtagCollection),
  competitors: many(competitor),
  comments: many(comment),
  mentions: many(mention),
  directMessages: many(directMessage),
  reviews: many(review),
  automations: many(automation),
  activities: many(activity),
  shopConnections: many(shopConnection),
  platformAnalytics: many(platformAnalytics),
  dailySnapshots: many(dailyAnalyticsSnapshot),
  scheduledReports: many(scheduledReport),
  draftInteractions: many(draftInteraction),
  engagementPredictions: many(engagementPrediction),
  sebReports: many(sebReport),
  sebRecommendations: many(sebRecommendation),
  sebChatSessions: many(sebChatSession),
  sebMediaAnalyses: many(sebMediaAnalysis),
  sebExperiments: many(sebExperiment),
  payments: many(payment),
  subscriptions: many(subscription),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const socialAccountRelations = relations(socialAccount, ({ one, many }) => ({
  organization: one(organization, {
    fields: [socialAccount.organizationId],
    references: [organization.id],
  }),
  pinterestBoardCache: one(pinterestBoardCache),
  audienceActivity: one(audienceActivity),
  posts: many(post),
  comments: many(comment),
  mentions: many(mention),
  directMessages: many(directMessage),
  reviews: many(review),
  analytics: many(platformAnalytics),
}));

export const pinterestBoardCacheRelations = relations(pinterestBoardCache, ({ one }) => ({
  socialAccount: one(socialAccount, {
    fields: [pinterestBoardCache.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const audienceActivityRelations = relations(audienceActivity, ({ one }) => ({
  socialAccount: one(socialAccount, {
    fields: [audienceActivity.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const postRelations = relations(post, ({ one, many }) => ({
  organization: one(organization, {
    fields: [post.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [post.socialAccountId],
    references: [socialAccount.id],
  }),
  media: many(postMedia),
  hashtags: many(postHashtag),
  products: many(postProduct),
  errors: many(publishError),
  analytics: one(postAnalytics),
  comments: many(comment),
  productTags: many(productTag),
}));

export const postMediaRelations = relations(postMedia, ({ one }) => ({
  post: one(post, {
    fields: [postMedia.postId],
    references: [post.id],
  }),
  media: one(media, {
    fields: [postMedia.mediaId],
    references: [media.id],
  }),
}));

export const postHashtagRelations = relations(postHashtag, ({ one }) => ({
  post: one(post, {
    fields: [postHashtag.postId],
    references: [post.id],
  }),
}));

export const postProductRelations = relations(postProduct, ({ one }) => ({
  post: one(post, {
    fields: [postProduct.postId],
    references: [post.id],
  }),
  product: one(product, {
    fields: [postProduct.productId],
    references: [product.id],
  }),
}));

export const publishErrorRelations = relations(publishError, ({ one }) => ({
  post: one(post, {
    fields: [publishError.postId],
    references: [post.id],
  }),
}));

export const mediaRelations = relations(media, ({ one, many }) => ({
  organization: one(organization, {
    fields: [media.organizationId],
    references: [organization.id],
  }),
  folder: one(mediaFolder, {
    fields: [media.folderId],
    references: [mediaFolder.id],
  }),
  sourceMedia: one(media, {
    fields: [media.sourceMediaId],
    references: [media.id],
  }),
  variants: many(media),
  sebAnalyses: many(sebMediaAnalysis),
}));

export const mediaFolderRelations = relations(mediaFolder, ({ one, many }) => ({
  organization: one(organization, {
    fields: [mediaFolder.organizationId],
    references: [organization.id],
  }),
  media: many(media),
}));

export const stockMediaImportRelations = relations(stockMediaImport, ({ one }) => ({
  organization: one(organization, {
    fields: [stockMediaImport.organizationId],
    references: [organization.id],
  }),
  media: one(media, {
    fields: [stockMediaImport.importedToMediaId],
    references: [media.id],
  }),
}));

export const commentRelations = relations(comment, ({ one, many }) => ({
  organization: one(organization, {
    fields: [comment.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [comment.socialAccountId],
    references: [socialAccount.id],
  }),
  post: one(post, {
    fields: [comment.postId],
    references: [post.id],
  }),
  replies: many(comment),
}));

export const reviewRelations = relations(review, ({ one }) => ({
  organization: one(organization, {
    fields: [review.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [review.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const mentionRelations = relations(mention, ({ one }) => ({
  organization: one(organization, {
    fields: [mention.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [mention.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const directMessageRelations = relations(directMessage, ({ one }) => ({
  organization: one(organization, {
    fields: [directMessage.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [directMessage.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const automationRelations = relations(automation, ({ one }) => ({
  organization: one(organization, {
    fields: [automation.organizationId],
    references: [organization.id],
  }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  organization: one(organization, {
    fields: [activity.organizationId],
    references: [organization.id],
  }),
}));

export const competitorRelations = relations(competitor, ({ one, many }) => ({
  organization: one(organization, {
    fields: [competitor.organizationId],
    references: [organization.id],
  }),
  posts: many(competitorPost),
}));

export const competitorPostRelations = relations(competitorPost, ({ one }) => ({
  competitor: one(competitor, {
    fields: [competitorPost.competitorId],
    references: [competitor.id],
  }),
}));

export const shopConnectionRelations = relations(shopConnection, ({ one }) => ({
  organization: one(organization, {
    fields: [shopConnection.organizationId],
    references: [organization.id],
  }),
}));

export const productCatalogRelations = relations(productCatalog, ({ one, many }) => ({
  organization: one(organization, {
    fields: [productCatalog.organizationId],
    references: [organization.id],
  }),
  products: many(product),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  catalog: one(productCatalog, {
    fields: [product.catalogId],
    references: [productCatalog.id],
  }),
  posts: many(postProduct),
  productTags: many(productTag),
}));

export const productTagRelations = relations(productTag, ({ one }) => ({
  post: one(post, {
    fields: [productTag.postId],
    references: [post.id],
  }),
  product: one(product, {
    fields: [productTag.productId],
    references: [product.id],
  }),
}));

export const platformAnalyticsRelations = relations(platformAnalytics, ({ one }) => ({
  organization: one(organization, {
    fields: [platformAnalytics.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [platformAnalytics.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const postAnalyticsRelations = relations(postAnalytics, ({ one }) => ({
  post: one(post, {
    fields: [postAnalytics.postId],
    references: [post.id],
  }),
}));

export const dailyAnalyticsSnapshotRelations = relations(dailyAnalyticsSnapshot, ({ one }) => ({
  organization: one(organization, {
    fields: [dailyAnalyticsSnapshot.organizationId],
    references: [organization.id],
  }),
}));

export const scheduledReportRelations = relations(scheduledReport, ({ one }) => ({
  organization: one(organization, {
    fields: [scheduledReport.organizationId],
    references: [organization.id],
  }),
}));

export const contentPillarRelations = relations(contentPillar, ({ one, many }) => ({
  organization: one(organization, {
    fields: [contentPillar.organizationId],
    references: [organization.id],
  }),
  posts: many(post),
}));

export const captionTemplateRelations = relations(captionTemplate, ({ one }) => ({
  organization: one(organization, {
    fields: [captionTemplate.organizationId],
    references: [organization.id],
  }),
}));

export const hashtagCollectionRelations = relations(hashtagCollection, ({ one }) => ({
  organization: one(organization, {
    fields: [hashtagCollection.organizationId],
    references: [organization.id],
  }),
}));

export const draftInteractionRelations = relations(draftInteraction, ({ one }) => ({
  organization: one(organization, {
    fields: [draftInteraction.organizationId],
    references: [organization.id],
  }),
  post: one(post, {
    fields: [draftInteraction.postId],
    references: [post.id],
  }),
}));

export const engagementPredictionRelations = relations(engagementPrediction, ({ one }) => ({
  organization: one(organization, {
    fields: [engagementPrediction.organizationId],
    references: [organization.id],
  }),
}));

export const sebReportRelations = relations(sebReport, ({ one, many }) => ({
  organization: one(organization, {
    fields: [sebReport.organizationId],
    references: [organization.id],
  }),
  recommendations: many(sebRecommendation),
  experiments: many(sebExperiment),
}));

export const sebRecommendationRelations = relations(sebRecommendation, ({ one }) => ({
  organization: one(organization, {
    fields: [sebRecommendation.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [sebRecommendation.socialAccountId],
    references: [socialAccount.id],
  }),
  report: one(sebReport, {
    fields: [sebRecommendation.reportId],
    references: [sebReport.id],
  }),
}));

export const sebChatSessionRelations = relations(sebChatSession, ({ one, many }) => ({
  organization: one(organization, {
    fields: [sebChatSession.organizationId],
    references: [organization.id],
  }),
  messages: many(sebChatMessage),
}));

export const sebChatMessageRelations = relations(sebChatMessage, ({ one }) => ({
  session: one(sebChatSession, {
    fields: [sebChatMessage.sessionId],
    references: [sebChatSession.id],
  }),
}));

export const sebMediaAnalysisRelations = relations(sebMediaAnalysis, ({ one }) => ({
  organization: one(organization, {
    fields: [sebMediaAnalysis.organizationId],
    references: [organization.id],
  }),
  media: one(media, {
    fields: [sebMediaAnalysis.mediaId],
    references: [media.id],
  }),
}));

export const sebExperimentRelations = relations(sebExperiment, ({ one }) => ({
  organization: one(organization, {
    fields: [sebExperiment.organizationId],
    references: [organization.id],
  }),
  report: one(sebReport, {
    fields: [sebExperiment.reportId],
    references: [sebReport.id],
  }),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  organization: one(organization, {
    fields: [payment.organizationId],
    references: [organization.id],
  }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  organization: one(organization, {
    fields: [subscription.organizationId],
    references: [organization.id],
  }),
}));