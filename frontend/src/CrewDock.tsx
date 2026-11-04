interface CrewCall {
  agent: string
  model: string
  ts?: number
  latency_ms?: number
  elapsed_ms?: number
}

interface CrewMember {
  id: string
  role: string
  color: string
  agents: Record<string, [thinking: string, done: string]>
}

/** Each crew member is backed by real agent roles in the Meta call log. */
export const CREW: CrewMember[] = [
  {
    id: "chief", role: "Chief Engineer", color: "#c5f292",
    agents: {
      supervisor: ["Coordinating the crew", "Gave the verdict"],
      investigator: ["Investigating the signal", "Submitted a finding"],
      "harness-distiller": ["Learning from the miss", "Wrote a new rule"],
    },
  },
  {
    id: "design", role: "Design Engineer", color: "#67d4ff",
    agents: {
      "blueprint-reviewer": ["Reading the blueprint", "Reviewed the drawing"],
      "design-physics": ["Checking the physics", "Proposed a change"],
      "figure-judge": ["Judging the figure", "Judged the figure"],
    },
  },
  {
    id: "inspector", role: "Inspector", color: "#f0b865",
    agents: {
      "sam-segmenter": ["Segmenting the photo", "Found the parts"],
      "assembly-grounder": ["Matching parts to the manual", "Wrote assembly steps"],
      "vision-specialist": ["Looking at the photo", "Identified the part"],
      "render-verifier": ["Comparing the 3D with the drawing", "Checked the 3D against the drawing"],
    },
  },
  {
    id: "librarian", role: "Manuals Expert", color: "#b9a6ff",
    agents: { "manual-chat": ["Searching the manual", "Cited the manual"] },
  },
  {
    id: "tech", role: "Field Technician", color: "#ff9f7a",
    agents: {
      "speech-to-text": ["Listening", "Heard you"],
      voice: ["Speaking", "Answered aloud"],
    },
  },
]

const SPOKE_MS = 6000

function memberFor(agent: string): CrewMember | undefined {
  return CREW.find((m) => agent in m.agents)
}

function Avatar({ color, state }: { color: string; state: "idle" | "thinking" | "spoke" }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className={`crew-face is-${state}`}>
      <circle cx="20" cy="22" r="11" fill="#1c2427" stroke={color} strokeWidth="2" />
      <path d="M8.5 17.5 a11.5 10 0 0 1 23 0 z" fill={color} />
      <rect x="6" y="16.5" width="28" height="3" rx="1.5" fill={color} />
      <circle cx="16" cy="23.5" r="1.4" fill="#e6eeec" />
      <circle cx="24" cy="23.5" r="1.4" fill="#e6eeec" />
      <path d={state === "spoke" ? "M15.5 27.5 q4.5 3.5 9 0" : "M16 28 h8"} stroke="#e6eeec"
        strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default function CrewDock({ calls, inflight }: { calls: CrewCall[]; inflight: CrewCall[] }) {
  const now = Date.now()
  const running = new Map<string, CrewCall>()
  for (const c of inflight) {
    const m = memberFor(c.agent)
    if (m && !running.has(m.id)) running.set(m.id, c)
  }
  const spoke = new Map<string, CrewCall>()
  for (const c of calls) {
    const m = memberFor(c.agent)
    if (m && c.ts && now - c.ts * 1000 < SPOKE_MS && !spoke.has(m.id)) spoke.set(m.id, c)
  }
  const focus =
    [...running.entries()].at(-1) ?? [...spoke.entries()].at(0)
  const focusMember = focus && CREW.find((m) => m.id === focus[0])
  const focusCall = focus?.[1]
  const thinking = focus ? running.has(focus[0]) : false

  return (
    <div className="crew-dock">
      <div className="crew-row">
        {CREW.map((m) => {
          const state = running.has(m.id) ? "thinking" : spoke.has(m.id) ? "spoke" : "idle"
          return (
            <div key={m.id} className={`crew-member is-${state}`} style={{ ["--crew" as string]: m.color }}>
              <Avatar color={m.color} state={state} />
              <span>{m.role}</span>
            </div>
          )
        })}
      </div>
      <p className={`crew-bubble ${focusMember ? "" : "is-quiet"}`}
        style={focusMember ? { ["--crew" as string]: focusMember.color } : undefined}>
        {focusMember && focusCall ? (
          <>
            <span className="crew-bubble-text">
              <strong>{focusMember.role}</strong>{" "}
              {thinking
                ? `${focusMember.agents[focusCall.agent][0]}… ${Math.round((focusCall.elapsed_ms ?? 0) / 1000)}s`
                : `${focusMember.agents[focusCall.agent][1]} · ${((focusCall.latency_ms ?? 0) / 1000).toFixed(1)}s`}
            </span>
            <em>{focusCall.model}</em>
          </>
        ) : (
          "Crew standing by"
        )}
      </p>
    </div>
  )
}
