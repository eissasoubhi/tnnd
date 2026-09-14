import {
  approvePersonalMemoryDraft,
  updatePersonalMemoryList,
  updatePersonalMemoryTextField,
  type PersonalMemoryReviewDraft
} from "./personal-memory-review";

export interface PersonalMemoryReviewPanelOptions {
  draft: PersonalMemoryReviewDraft;
  onChange(draft: PersonalMemoryReviewDraft): void;
  onApprove?(draft: PersonalMemoryReviewDraft): void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function renderList(values: string[]): string {
  return escapeHtml(values.join("\n"));
}

export function renderPersonalMemoryReviewPanel(container: HTMLElement, options: PersonalMemoryReviewPanelOptions): void {
  const draft = options.draft;
  container.innerHTML = `
    <section class="personal-memory-review" aria-label="Personal memory review">
      <header>
        <div>
          <strong>Review personal memory</strong>
          <p class="subtle">The original anecdote stays unchanged. Review the AI structure before allowing TNND to use it in conversations.</p>
        </div>
        <span>${draft.reviewStatus === "approved" ? "Approved" : "Draft"}</span>
      </header>

      <details>
        <summary>Original source</summary>
        <p>${escapeHtml(draft.originalText)}</p>
      </details>

      <label>Title
        <input data-memory-field="title" maxlength="160" value="${escapeHtml(draft.title)}" />
      </label>
      <label>Category
        <input data-memory-field="category" maxlength="80" value="${escapeHtml(draft.category)}" />
      </label>
      <label>Summary
        <textarea data-memory-field="summary" maxlength="1000" rows="4">${escapeHtml(draft.summary)}</textarea>
      </label>
      <label>Immutable facts <span class="subtle">one per line</span>
        <textarea data-memory-list="immutableFacts" rows="5">${renderList(draft.immutableFacts)}</textarea>
      </label>
      <label>Topics <span class="subtle">one per line</span>
        <textarea data-memory-list="topics" rows="3">${renderList(draft.topics)}</textarea>
      </label>
      <label>Conversation hooks <span class="subtle">one per line</span>
        <textarea data-memory-list="conversationHooks" rows="4">${renderList(draft.conversationHooks)}</textarea>
      </label>

      <div class="memory-review-options">
        <label>Sensitivity
          <select data-memory-option="sensitivity">
            ${["low", "medium", "high"].map((value) => `<option value="${value}"${draft.sensitivity === value ? " selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label>Creative freedom
          <select data-memory-option="creativeFreedom">
            ${["strict", "natural", "storyteller"].map((value) => `<option value="${value}"${draft.creativeFreedom === value ? " selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label>
          <input type="checkbox" data-memory-option="allowedForChat"${draft.allowedForChat ? " checked" : ""} />
          Allow use in chat
        </label>
      </div>

      <button type="button" data-memory-action="approve">Approve structured memory</button>
      <p class="subtle">Approval never permits inventing new precise facts, people, places or dates.</p>
    </section>
  `;

  container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-memory-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const field = input.dataset.memoryField as "title" | "category" | "summary";
      options.draft = updatePersonalMemoryTextField(options.draft, field, input.value);
      options.onChange(options.draft);
    });
  });

  container.querySelectorAll<HTMLTextAreaElement>("[data-memory-list]").forEach((input) => {
    input.addEventListener("input", () => {
      const field = input.dataset.memoryList as "immutableFacts" | "topics" | "conversationHooks";
      options.draft = updatePersonalMemoryList(options.draft, field, input.value);
      options.onChange(options.draft);
    });
  });

  container.querySelectorAll<HTMLSelectElement>("select[data-memory-option]").forEach((select) => {
    select.addEventListener("change", () => {
      if (select.dataset.memoryOption === "sensitivity") {
        options.draft = { ...options.draft, sensitivity: select.value as PersonalMemoryReviewDraft["sensitivity"], reviewStatus: "draft" };
      } else {
        options.draft = { ...options.draft, creativeFreedom: select.value as PersonalMemoryReviewDraft["creativeFreedom"], reviewStatus: "draft" };
      }
      options.onChange(options.draft);
    });
  });

  container.querySelector<HTMLInputElement>("input[data-memory-option='allowedForChat']")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    options.draft = { ...options.draft, allowedForChat: input.checked, reviewStatus: "draft" };
    options.onChange(options.draft);
  });

  container.querySelector<HTMLButtonElement>("[data-memory-action='approve']")?.addEventListener("click", () => {
    try {
      options.draft = approvePersonalMemoryDraft(options.draft);
      options.onChange(options.draft);
      options.onApprove?.(options.draft);
      renderPersonalMemoryReviewPanel(container, options);
    } catch (error) {
      console.error("Unable to approve TNND personal memory", error);
    }
  });
}
