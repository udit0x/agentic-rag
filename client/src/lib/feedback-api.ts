/**
 * Client-side API functions for message feedback
 */

import { apiRequest, API_CONFIG } from "./api-config";

export type FeedbackType = "positive" | "negative";

export type FeedbackCategory =
  | "ignored_instructions"
  | "fetched_multiple_documents"
  | "harmful_offensive"
  | "forgot_context"
  | "missing_information"
  | "other";

export interface SubmitFeedbackRequest {
  messageId: string;
  sessionId: string;
  feedbackType: FeedbackType;
  category?: FeedbackCategory;
  detailText?: string;
  queryContext?: {
    originalQuery?: string;
    responseType?: string;
    sourcesUsed?: string[];
    agentChain?: string[];
  };
  metadata?: Record<string, any>;
}

export interface FeedbackResponse {
  id: string;
  messageId: string;
  feedbackType: FeedbackType;
  createdAt: string;
  message: string;
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  feedbackType: FeedbackType;
  category?: FeedbackCategory;
  detailText?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Submit feedback for a message
 */
export async function submitMessageFeedback(
  data: SubmitFeedbackRequest
): Promise<FeedbackResponse> {
  // Transform payload for API
  const payload = {
    message_id: data.messageId,
    session_id: data.sessionId,
    feedback_type: data.feedbackType,
    category: data.category,
    detail_text: data.detailText,
    query_context: data.queryContext ? {
      original_query: data.queryContext.originalQuery,
      response_type: data.queryContext.responseType,
      sources_used: data.queryContext.sourcesUsed,
      agent_chain: data.queryContext.agentChain,
    } : undefined,
    metadata: data.metadata,
  };

  return apiRequest<FeedbackResponse>(`${API_CONFIG.API_BASE_URL}/api/feedback/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Get feedback for a specific message
 */
export async function getMessageFeedback(
  messageId: string
): Promise<MessageFeedback | null> {
  return apiRequest<MessageFeedback | null>(
    `${API_CONFIG.API_BASE_URL}/api/feedback/message/${messageId}`,
    {
      method: "GET",
    }
  );
}

/**
 * Delete feedback for a message
 */
export async function deleteMessageFeedback(messageId: string): Promise<void> {
  await apiRequest<{ message: string }>(
    `${API_CONFIG.API_BASE_URL}/api/feedback/message/${messageId}`,
    {
      method: "DELETE",
    }
  );
}
