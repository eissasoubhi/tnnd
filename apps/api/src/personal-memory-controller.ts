import {
  approvePersonalMemory,
  createPersonalMemory,
  deletePersonalMemory,
  getPersonalMemory,
  listPersonalMemories,
  markPersonalMemoriesUsed,
  updatePersonalMemoryAnalysis
} from "./personal-memory-service.js";

export type PersonalMemoryControllerResult = { status: number; body: unknown };

function memoryId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function handlePersonalMemoryListRequest(userId: string): Promise<PersonalMemoryControllerResult> {
  return { status: 200, body: { memories: await listPersonalMemories(userId) } };
}

export async function handlePersonalMemoryGetRequest(userId: string, idValue: unknown): Promise<PersonalMemoryControllerResult> {
  const id = memoryId(idValue);
  if (!id) return { status: 400, body: { error: "missing_personal_memory_id" } };
  const memory = await getPersonalMemory(userId, id);
  return memory ? { status: 200, body: { memory } } : { status: 404, body: { error: "personal_memory_not_found" } };
}

export async function handlePersonalMemoryCreateRequest(userId: string, body: Record<string, unknown>): Promise<PersonalMemoryControllerResult> {
  try {
    const memory = await createPersonalMemory(userId, body.originalText, body.structuredAnalysis);
    return { status: 201, body: { memory } };
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : "invalid_personal_memory" } };
  }
}

export async function handlePersonalMemoryUpdateRequest(userId: string, idValue: unknown, body: Record<string, unknown>): Promise<PersonalMemoryControllerResult> {
  const id = memoryId(idValue);
  if (!id) return { status: 400, body: { error: "missing_personal_memory_id" } };
  try {
    const memory = await updatePersonalMemoryAnalysis(userId, id, body.structuredAnalysis);
    return memory ? { status: 200, body: { memory } } : { status: 404, body: { error: "personal_memory_not_found" } };
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : "invalid_personal_memory" } };
  }
}

export async function handlePersonalMemoryApproveRequest(userId: string, idValue: unknown): Promise<PersonalMemoryControllerResult> {
  const id = memoryId(idValue);
  if (!id) return { status: 400, body: { error: "missing_personal_memory_id" } };
  try {
    const memory = await approvePersonalMemory(userId, id);
    return memory ? { status: 200, body: { memory } } : { status: 404, body: { error: "personal_memory_not_found" } };
  } catch (error) {
    return { status: 409, body: { error: error instanceof Error ? error.message : "personal_memory_not_approvable" } };
  }
}

export async function handlePersonalMemoryUsageRequest(userId: string, body: Record<string, unknown>): Promise<PersonalMemoryControllerResult> {
  try {
    return { status: 200, body: { memories: await markPersonalMemoriesUsed(userId, body.memoryIds) } };
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : "invalid_personal_memory_usage_ids" } };
  }
}

export async function handlePersonalMemoryDeleteRequest(userId: string, idValue: unknown): Promise<PersonalMemoryControllerResult> {
  const id = memoryId(idValue);
  if (!id) return { status: 400, body: { error: "missing_personal_memory_id" } };
  return await deletePersonalMemory(userId, id)
    ? { status: 200, body: { ok: true } }
    : { status: 404, body: { error: "personal_memory_not_found" } };
}
