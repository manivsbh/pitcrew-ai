import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import type { RenderSkill } from "./sim/assembly"

type Skill = RenderSkill & { reason?: string; source_response_id?: string | null; created?: string }

const describe = (s: Skill): string => {
  const then = s.then.shape
    ? `draw as ${s.then.shape}`
    : s.then.mount_as
      ? `mount as ${s.then.mount_as.replace("_", " ")}`
      : "hide"
  return `/${s.when.name_regex}/${s.when.near_shape ? ` near ${s.when.near_shape}` : ""} → ${then}`
}

/** Render skills written by muse-spark-1.3 during Meta vision checks; applied to every machine. */
export default function RenderSkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [err, setErr] = useState("")

  const load = () =>
    fetch("/api/render-skills")
      .then((r) => r.json())
      .then((b: { skills?: Skill[] }) => setSkills(b.skills ?? []))
      .catch((e) => setErr((e as Error).message))

  useEffect(() => {
    void load()
  }, [])

  const toggle = async (s: Skill) => {
    await fetch(`/api/render-skills/${s.id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: s.enabled === false }),
    })
    void load()
  }

  return (
    <section className="panel largepanel">
      <div className="section-title">
        <span>
          <Sparkles size={15} /> Render skills
        </span>
        <small>written by muse-spark-1.3 · applied to every machine</small>
      </div>
      {err && <p className="muted">Could not load skills: {err}</p>}
      {!skills.length && !err && (
        <p className="muted">
          No skills yet. They appear after a Meta vision check compares a 3D build with its drawing.
        </p>
      )}
      {skills.map((s) => (
        <div key={s.id} className="dimension" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            aria-label={`Enable skill ${s.id}`}
            checked={s.enabled !== false}
            onChange={() => void toggle(s)}
          />
          <div style={{ flex: 1 }}>
            <code>{describe(s)}</code>
            {s.reason && <p className="muted">{s.reason}</p>}
          </div>
          <small className="muted">{s.source_response_id ?? ""}</small>
        </div>
      ))}
    </section>
  )
}
