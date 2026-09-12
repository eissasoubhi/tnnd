import "./styles.css";

type ConversationState = "Active" | "Waiting for them" | "Action required" | "Paused";

interface DashboardCard {
  label: string;
  value: number;
  state: ConversationState;
}

const cards: DashboardCard[] = [
  { label: "Active conversations", value: 0, state: "Active" },
  { label: "Waiting for them", value: 0, state: "Waiting for them" },
  { label: "Human actions", value: 0, state: "Action required" },
  { label: "Paused", value: 0, state: "Paused" }
];

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("TNND web app root was not found.");

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">TNND</p>
        <h1>Conversation control center</h1>
        <p class="subtle">Platform foundation for profile, conversations, actions, memories and analytics.</p>
      </div>
      <span class="status">Platform foundation</span>
    </header>

    <section class="metrics" aria-label="Conversation overview">
      ${cards.map((card) => `
        <article class="metric">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <small>${card.state}</small>
        </article>
      `).join("")}
    </section>

    <section class="grid">
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Next foundation</p>
            <h2>Account & profile</h2>
          </div>
          <span class="pill">Planned</span>
        </div>
        <p>Authentication, global dating intent, texting identity and secure AI-provider settings will live here.</p>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Operations</p>
            <h2>Action Center</h2>
          </div>
          <span class="pill">0 pending</span>
        </div>
        <p>Manual actions such as Instagram, WhatsApp, availability and low-confidence personal questions will be surfaced here.</p>
      </article>
    </section>
  </section>
`;
