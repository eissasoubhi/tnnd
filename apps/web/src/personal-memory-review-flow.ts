import type { AuthSession } from "./auth-client";
import {
  approvePersonalMemory,
  createPersonalMemoryFromAnecdote,
  updatePersonalMemory
} from "./personal-memory-client";
import { toPersonalMemoryLibraryItem, type PersonalMemoryLibraryItem } from "./personal-memory-library";
import type { PersonalMemoryReviewDraft } from "./personal-memory-review";

export type PersonalMemoryReviewFlowState =
  | { status: "idle" }
  | { status: "analyzing"; originalText: string }
  | { status: "review"; item: PersonalMemoryLibraryItem }
  | { status: "saving"; item: PersonalMemoryLibraryItem }
  | { status: "approving"; item: PersonalMemoryLibraryItem }
  | { status: "approved"; item: PersonalMemoryLibraryItem }
  | { status: "error"; message: string; item?: PersonalMemoryLibraryItem };

/**
 * Small UI-agnostic coordinator for roadmap #5 Phase 6.
 * The raw anecdote is analyzed by the backend first. Approval remains an
 * explicit second action after the user has had a chance to review/edit the
 * structured result.
 */
export class PersonalMemoryReviewFlow {
  state: PersonalMemoryReviewFlowState = { status: "idle" };

  constructor(private readonly session: AuthSession) {}

  async analyze(originalText: string): Promise<PersonalMemoryLibraryItem> {
    const text = originalText.trim();
    if (!text) throw new Error("Personal Memory anecdote cannot be empty.");
    this.state = { status: "analyzing", originalText: text };
    try {
      const item = toPersonalMemoryLibraryItem(await createPersonalMemoryFromAnecdote(this.session, text));
      this.state = { status: "review", item };
      return item;
    } catch (error) {
      this.state = { status: "error", message: errorMessage(error) };
      throw error;
    }
  }

  async save(item: PersonalMemoryLibraryItem, draft: PersonalMemoryReviewDraft): Promise<PersonalMemoryLibraryItem> {
    if (draft.originalText !== item.draft.originalText) {
      throw new Error("The original anecdote is the source of truth and cannot be edited during structured review.");
    }
    const reviewDraft: PersonalMemoryReviewDraft = { ...draft, reviewStatus: "draft" };
    this.state = { status: "saving", item };
    try {
      const saved = toPersonalMemoryLibraryItem(await updatePersonalMemory(this.session, item.id, reviewDraft));
      this.state = { status: "review", item: saved };
      return saved;
    } catch (error) {
      this.state = { status: "error", message: errorMessage(error), item };
      throw error;
    }
  }

  async approve(item: PersonalMemoryLibraryItem): Promise<PersonalMemoryLibraryItem> {
    if (item.draft.reviewStatus !== "draft") throw new Error("Only a reviewed draft can be approved.");
    this.state = { status: "approving", item };
    try {
      const approved = toPersonalMemoryLibraryItem(await approvePersonalMemory(this.session, item.id));
      this.state = { status: "approved", item: approved };
      return approved;
    } catch (error) {
      this.state = { status: "error", message: errorMessage(error), item };
      throw error;
    }
  }

  reset(): void {
    this.state = { status: "idle" };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Personal Memory operation failed.";
}
