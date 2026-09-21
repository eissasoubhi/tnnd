import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession, listAccountSessions, loginWithPassword, registerAccount, revokeAccountSession, revokeSession } from "./auth-service.js";
import { handleConversationGenerationRequest } from "./conversation-generation-controller.js";
import { bulkUpdateConversationManagement, isConversationManagementState, listConversationManagement, updateConversationManagement, type ConversationManagementUpdate } from "./conversation-management-service.js";
import { handleOutgoingConfirmationRequest } from "./conversation-outgoing-confirmation-controller.js";
import { clearConversationOverrides, getConversationOverrides, replaceConversationOverrides } from "./conversation-overrides-service.js";
import { clearConversationTemporaryInstruction, getConversation, listConversations, setConversationTemporaryInstruction, syncConversation, updateConversationStatus, type TemporaryInstructionScope } from "./conversation-service.js";
import { isConversationStatus, validateConversationSyncRequest } from "./conversation-sync-contract.js";
import { conversationSyncErrorResponse } from "./conversation-sync-error-response.js";
import { handleConversationThreadLookupRequest } from "./conversation-thread-lookup-controller.js";
import { getPool } from "./db-client.js";
import { handleHumanActionManualAnswerRequest } from "./human-action-manual-answer-controller.js";
import { createHumanAction, listHumanActions, updateHumanActionStatus, type HumanActionSeverity, type HumanActionStatus } from "./human-action-service.js";
import { handleConversationMatchProfileRequest, handleMatchProfileCaptureRequest, handleMatchProfilePromoteRequest } from "./match-profile-controller.js";
import { profileSchemaVersion, publicProfileSchema, validateProfileEnvelope } from "./profile-schema.js";
import { handleProductionAiHttp } from "./production-ai-http-handler.js";
import { handleTextingStyleAnalysisRequest } from "./texting-style-analysis-controller.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const maxBodyBytes = 32 * 1024;
const humanActionSeverities = new Set<HumanActionSeverity>(["info", "action-required", "decision-required", "urgent"]);
const humanActionStatuses = new Set<HumanActionStatus>(["pending", "completed", "ignored"]);
const temporaryInstructionScopes = new Set<TemporaryInstructionScope>(["next-message", "next-n-replies", "until-cleared"]);

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-resource-policy": "same-site"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function authenticatedUser(request: IncomingMessage) {
  const token = bearerToken(request);
  if (!token) return null;
  return authenticateSession(await hashSessionToken(token));
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function conversationDisplayName(conversationId: string): string {
  return `Conversation ${conversationId.slice(0, 8)}`;
}

function conversationSubresourceId(pathname: string, suffix: string): string | null {
  const prefix = "/api/v1/conversations/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const encoded = pathname.slice(prefix.length, -suffix.length);
  return encoded ? decodeURIComponent(encoded) : null;
}

function humanActionSubresourceId(pathname: string, suffix: string): string | null {
  const prefix = "/api/v1/human-actions/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const encoded = pathname.slice(prefix.length, -suffix.length);
  return encoded ? decodeURIComponent(encoded) : null;
}

function matchProfileSubresourceId(pathname: string, suffix: string): string | null {
  const prefix = "/api/v1/match-profiles/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const encoded = pathname.slice(prefix.length, -suffix.length);
  return encoded ? decodeURIComponent(encoded) : null;
}

function parseConversationManagementUpdates(value: unknown): ConversationManagementUpdate[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const updates: ConversationManagementUpdate[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const input = item as Record<string, unknown>;
    const conversationId = stringField(input.conversationId);
    if (!conversationId || ids.has(conversationId) || !isConversationManagementState(input.managementState)) return null;
    ids.add(conversationId);
    updates.push({ conversationId, managementState: input.managementState });
  }
  return updates;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

  try {
    if (await handleProductionAiHttp(request, response, url.pathname, readJsonBody, sendJson)) return;

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "tnnd-api", version: "0.1.0", now: new Date().toISOString() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/meta") {
      sendJson(response, 200, {
        apiVersion: "v1",
        capabilities: ["health", "profile-schema", "account-registration", "password-login", "session-auth", "session-revocation", "session-management", "session-client-metadata", "account-profile", "texting-style-analysis", "extension-sync-foundation", "conversation-sync", "conversation-read", "conversation-thread-lookup", "conversation-status-control", "conversation-management", "conversation-temporary-instructions", "conversation-overrides", "conversation-generation", "conversation-outgoing-confirmation", "match-profiles", "human-actions", "human-action-manual-answer", "security-baseline"]
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/profile/schema") {
      sendJson(response, 200, publicProfileSchema());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/auth/register") {
      const body = await readJsonBody(request);
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const registration = await registerAccount(email, password);
      if (!registration.ok) {
        const status = registration.error === "email_already_exists" ? 409 : 400;
        sendJson(response, status, { error: registration.error, ...(registration.details ? { details: registration.details } : {}) });
        return;
      }
      sendJson(response, 201, registration);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
      const body = await readJsonBody(request);
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const clientType = body.clientType === "extension" ? "extension" : "web";
      const deviceLabel = typeof body.deviceLabel === "string" ? body.deviceLabel : undefined;
      const login = await loginWithPassword(email, password, { clientType, deviceLabel });
      if (!login) {
        sendJson(response, 401, { error: "invalid_credentials" });
        return;
      }
      sendJson(response, 200, login);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/auth/session") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      sendJson(response, 200, session);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/auth/sessions") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      sendJson(response, 200, { sessions: await listAccountSessions(session.user.id, session.sessionId) });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/v1/auth/sessions/")) {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const sessionId = decodeURIComponent(url.pathname.slice("/api/v1/auth/sessions/".length));
      if (!sessionId) {
        sendJson(response, 400, { error: "missing_session_id" });
        return;
      }
      const revoked = await revokeAccountSession(session.user.id, sessionId);
      sendJson(response, revoked ? 200 : 404, revoked ? { ok: true } : { error: "session_not_found" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      const token = bearerToken(request);
      if (!token) {
        sendJson(response, 401, { error: "missing_bearer_token" });
        return;
      }
      const revoked = await revokeSession(await hashSessionToken(token));
      sendJson(response, revoked ? 200 : 404, revoked ? { ok: true } : { error: "session_not_found" });
      return;
    }

    if ((request.method === "GET" || request.method === "PUT") && url.pathname === "/api/v1/profile") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }

      if (request.method === "GET") {
        const result = await getPool().query<{ profile_json: unknown; updated_at: Date }>(
          "SELECT profile_json, updated_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
          [session.user.id]
        );
        const row = result.rows[0];
        if (!row) {
          sendJson(response, 404, { error: "profile_not_found" });
          return;
        }
        sendJson(response, 200, { profile: row.profile_json, updatedAt: row.updated_at.toISOString() });
        return;
      }

      const body = await readJsonBody(request);
      const candidate = body.profile ?? body;
      const validated = validateProfileEnvelope(candidate);
      if (!validated.ok) {
        sendJson(response, 400, { error: "invalid_profile", details: validated.errors });
        return;
      }
      const result = await getPool().query<{ updated_at: Date }>(
        `INSERT INTO user_profiles (user_id, schema_version, profile_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET
           schema_version = EXCLUDED.schema_version,
           profile_json = EXCLUDED.profile_json,
           updated_at = now()
         RETURNING updated_at`,
        [session.user.id, profileSchemaVersion, JSON.stringify(validated.profile)]
      );
      sendJson(response, 200, { profile: validated.profile, updatedAt: result.rows[0]?.updated_at.toISOString() ?? new Date().toISOString() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/profile/texting-style/analyze") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleTextingStyleAnalysisRequest(await readJsonBody(request));
      sendJson(response, result.status, result.body);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/match-profiles/capture") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleMatchProfileCaptureRequest(session.user.id, await readJsonBody(request));
      sendJson(response, result.status, result.body);
      return;
    }

    const promoteMatchProfileId = matchProfileSubresourceId(url.pathname, "/promote");
    if (promoteMatchProfileId && request.method === "POST") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleMatchProfilePromoteRequest(session.user.id, promoteMatchProfileId, await readJsonBody(request));
      sendJson(response, result.status, result.body);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/conversations/sync") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const input = validateConversationSyncRequest(body);
        sendJson(response, 200, await syncConversation(session.user.id, input));
      } catch (error) {
        const mapped = conversationSyncErrorResponse(error);
        sendJson(response, mapped.status, mapped.body);
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/conversations") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const conversations = await listConversations(session.user.id);
      sendJson(response, 200, {
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          displayName: conversationDisplayName(conversation.id),
          status: conversation.status,
          currentTopic: conversation.currentTopic ?? null,
          lastMessageAt: conversation.lastMessageAt ?? conversation.updatedAt,
          pendingHumanActions: conversation.pendingHumanActions ?? 0
        }))
      });
      return;
    }

    if (url.pathname === "/api/v1/conversations/management" && (request.method === "GET" || request.method === "PUT")) {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }

      if (request.method === "GET") {
        sendJson(response, 200, { conversations: await listConversationManagement(session.user.id) });
        return;
      }

      const body = await readJsonBody(request);
      const updates = parseConversationManagementUpdates(body.updates);
      if (!updates) {
        sendJson(response, 400, { error: "invalid_conversation_management_bulk_update" });
        return;
      }
      const records = await bulkUpdateConversationManagement(session.user.id, updates);
      sendJson(response, records ? 200 : 404, records ? { conversations: records } : { error: "conversation_not_found" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/conversations/by-external-thread") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleConversationThreadLookupRequest(session.user.id, url.searchParams.get("externalThreadId"));
      sendJson(response, result.status, result.body);
      return;
    }

    const matchProfileConversationId = conversationSubresourceId(url.pathname, "/match-profile");
    if (matchProfileConversationId && request.method === "GET") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleConversationMatchProfileRequest(session.user.id, matchProfileConversationId);
      sendJson(response, result.status, result.body);
      return;
    }

    const managementConversationId = conversationSubresourceId(url.pathname, "/management");
    if (managementConversationId && request.method === "PATCH") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const body = await readJsonBody(request);
      if (!isConversationManagementState(body.managementState)) {
        sendJson(response, 400, { error: "invalid_conversation_management_state" });
        return;
      }
      const conversation = await updateConversationManagement(session.user.id, managementConversationId, body.managementState);
      sendJson(response, conversation ? 200 : 404, conversation ? { conversation } : { error: "conversation_not_found" });
      return;
    }

    const generationConversationId = conversationSubresourceId(url.pathname, "/generate");
    if (generationConversationId && request.method === "POST") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleConversationGenerationRequest(session.user.id, generationConversationId, await readJsonBody(request));
      sendJson(response, result.status, result.body);
      return;
    }

    const outgoingConfirmationConversationId = conversationSubresourceId(url.pathname, "/outgoing/confirm");
    if (outgoingConfirmationConversationId && request.method === "POST") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleOutgoingConfirmationRequest(session.user.id, outgoingConfirmationConversationId, await readJsonBody(request));
      sendJson(response, result.status, result.body);
      return;
    }

    const instructionConversationId = conversationSubresourceId(url.pathname, "/instruction");
    if (instructionConversationId && (request.method === "PUT" || request.method === "DELETE")) {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }

      if (request.method === "DELETE") {
        const cleared = await clearConversationTemporaryInstruction(session.user.id, instructionConversationId);
        sendJson(response, cleared ? 200 : 404, cleared ? { ok: true } : { error: "conversation_not_found" });
        return;
      }

      const body = await readJsonBody(request);
      const text = stringField(body.text);
      const scope = body.scope as TemporaryInstructionScope;
      const rawRemainingReplies = body.remainingReplies;
      const remainingReplies = typeof rawRemainingReplies === "number" && Number.isInteger(rawRemainingReplies)
        ? rawRemainingReplies
        : undefined;
      const validRemainingReplies = scope !== "next-n-replies"
        || (remainingReplies !== undefined && remainingReplies >= 1 && remainingReplies <= 50);
      if (!text || text.length > 2000 || !temporaryInstructionScopes.has(scope) || !validRemainingReplies) {
        sendJson(response, 400, { error: "invalid_temporary_instruction" });
        return;
      }
      const instruction = await setConversationTemporaryInstruction(session.user.id, instructionConversationId, {
        text,
        scope,
        ...(scope === "next-n-replies" && remainingReplies ? { remainingReplies } : {})
      });
      sendJson(response, instruction ? 200 : 404, instruction ? { instruction } : { error: "conversation_not_found" });
      return;
    }

    const overridesId = conversationSubresourceId(url.pathname, "/overrides");
    if (overridesId && (request.method === "GET" || request.method === "PUT" || request.method === "DELETE")) {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }

      if (request.method === "GET") {
        const overrides = await getConversationOverrides(session.user.id, overridesId);
        sendJson(response, overrides ? 200 : 404, overrides ? { overrides } : { error: "conversation_not_found" });
        return;
      }

      if (request.method === "DELETE") {
        const cleared = await clearConversationOverrides(session.user.id, overridesId);
        sendJson(response, cleared ? 200 : 404, cleared ? { ok: true } : { error: "conversation_not_found" });
        return;
      }

      try {
        const body = await readJsonBody(request);
        const overrides = await replaceConversationOverrides(session.user.id, overridesId, body.overrides ?? body);
        sendJson(response, overrides ? 200 : 404, overrides ? { overrides } : { error: "conversation_not_found" });
      } catch (error) {
        const details = error instanceof Error ? error.message : "invalid_conversation_overrides";
        sendJson(response, 400, { error: "invalid_conversation_overrides", details });
      }
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/v1/conversations/")) {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const conversationId = decodeURIComponent(url.pathname.slice("/api/v1/conversations/".length));
      const body = await readJsonBody(request);
      if (!conversationId || !isConversationStatus(body.status)) {
        sendJson(response, 400, { error: "invalid_conversation_status_update" });
        return;
      }
      const conversation = await updateConversationStatus(session.user.id, conversationId, body.status);
      sendJson(response, conversation ? 200 : 404, conversation ? { conversation } : { error: "conversation_not_found" });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/v1/conversations/")) {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const conversationId = decodeURIComponent(url.pathname.slice("/api/v1/conversations/".length));
      if (!conversationId) {
        sendJson(response, 400, { error: "missing_conversation_id" });
        return;
      }
      const conversation = await getConversation(session.user.id, conversationId);
      if (!conversation) {
        sendJson(response, 404, { error: "conversation_not_found" });
        return;
      }
      sendJson(response, 200, {
        conversation: {
          id: conversation.id,
          displayName: conversationDisplayName(conversation.id),
          status: conversation.status,
          currentTopic: conversation.currentTopic ?? null,
          pendingHumanActions: conversation.pendingHumanActions ?? 0,
          temporaryInstruction: conversation.temporaryInstruction ?? null,
          messages: conversation.messages
        }
      });
      return;
    }

    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/v1/human-actions") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }

      if (request.method === "GET") {
        const rawStatus = url.searchParams.get("status");
        if (rawStatus && !humanActionStatuses.has(rawStatus as HumanActionStatus)) {
          sendJson(response, 400, { error: "invalid_human_action_status" });
          return;
        }
        sendJson(response, 200, { actions: await listHumanActions(session.user.id, rawStatus as HumanActionStatus | undefined) });
        return;
      }

      const body = await readJsonBody(request);
      const title = stringField(body.title);
      const detail = stringField(body.detail);
      const severity = body.severity as HumanActionSeverity;
      if (!title || !detail || !humanActionSeverities.has(severity)) {
        sendJson(response, 400, { error: "invalid_human_action" });
        return;
      }
      const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? body.context as Record<string, unknown>
        : undefined;
      const action = await createHumanAction(session.user.id, {
        title,
        detail,
        severity,
        conversationRef: stringField(body.conversationRef) || undefined,
        conversationLabel: stringField(body.conversationLabel) || undefined,
        context
      });
      sendJson(response, 201, { action });
      return;
    }

    const manualAnswerActionId = humanActionSubresourceId(url.pathname, "/manual-answer");
    if (manualAnswerActionId && request.method === "POST") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const result = await handleHumanActionManualAnswerRequest(session.user.id, manualAnswerActionId, await readJsonBody(request));
      sendJson(response, result.status, result.body);
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/v1/human-actions/")) {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      const actionId = decodeURIComponent(url.pathname.slice("/api/v1/human-actions/".length));
      const body = await readJsonBody(request);
      const status = body.status as HumanActionStatus;
      if (!actionId || !humanActionStatuses.has(status)) {
        sendJson(response, 400, { error: "invalid_human_action_update" });
        return;
      }
      const action = await updateHumanActionStatus(session.user.id, actionId, status);
      sendJson(response, action ? 200 : 404, action ? { action } : { error: "human_action_not_found" });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (message === "body_too_large") {
      sendJson(response, 413, { error: message });
      return;
    }
    if (error instanceof SyntaxError || message === "invalid_json") {
      sendJson(response, 400, { error: "invalid_json" });
      return;
    }
    console.error("TNND API request failed", error);
    sendJson(response, 500, { error: "internal_error" });
  }
});

server.listen(port, host, () => {
  console.log(`TNND API listening on http://${host}:${port}`);
});
