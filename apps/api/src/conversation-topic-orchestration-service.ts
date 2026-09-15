import { analyzeConversationTopicsWithGemini } from "./conversation-topic-analysis-provider.js";
import { getConversation } from "./conversation-service.js";
import { recordConversationTopics, type ConversationTopicState, getConversationTopicState } from "./conversation-topic-service.js";

export interface ConversationTopicAnalysisOutcome {
  state: ConversationTopicState;
  model: string;
}

export async function analyzeAndRecordConversationTopics(
  userId: string,
  conversationId: string
): Promise<ConversationTopicAnalysisOutcome | null> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) return null;

  const messages = conversation.messages
    .slice(-12)
    .map((message) => `${message.direction}: ${message.text}`);
  if (!messages.length) return null;

  const analysis = await analyzeConversationTopicsWithGemini(messages);
  const latestMessageAt = conversation.messages.at(-1)?.sentAt;
  await recordConversationTopics(
    conversationId,
    analysis.topics,
    latestMessageAt ? new Date(latestMessageAt) : new Date()
  );
  return {
    state: await getConversationTopicState(conversationId),
    model: analysis.model
  };
}
