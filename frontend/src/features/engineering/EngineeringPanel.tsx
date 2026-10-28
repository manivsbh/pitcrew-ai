import { useState } from "react"
import {
  FlaskConical,
  FunctionSquare,
  PencilRuler,
  ArrowUpRight,
  RotateCcw,
  Mic,
  Square,
  Check,
  AlertTriangle,
} from "lucide-react"
import {
  calculate,
  defaults,
  fields,
  interpret,
  patchInput,
  type Inputs,
  type MachineId,
  type Result,
} from "../../physics/models"
import { useVoiceInput } from "./useVoiceInput"

export type RecordEntry = {
  id: string
  timestamp: string
  source: string
  command: string
  baseline: Inputs
  candidate: Inputs
  result: Result
  applied: boolean
}
export type Session = {
  applied: Inputs
  baseline: Inputs
  draft: Inputs
  result: Result | null
  records: RecordEntry[]
  message: string
  source: string
  command: string
  confirmation: boolean
}
export function createSession(id: MachineId): Session {
  return {
    applied: { ...defaults[id] },
    baseline: { ...defaults[id] },
    draft: { ...defaults[id] },
    result: null,
    records: [],
    message: "",
    source: "control",
    command: "",
    confirmation: false,
  }
}
export const formatValue = (value: number | null) =>
  value === null
    ? "Not available"
    : Math.abs(value) > 0 && Math.abs(value) < 0.001
      ? value.toExponential(3)
      : value.toLocaleString(undefined, { maximumFractionDigits: 3 })
export function propose(
  session: Session,
  text: string,
  source = "typed",
): Session {
  const response = interpret(text, session.applied)
  if (!response.patch)
    return {
      ...session,
      message: response.message,
      result: null,
      source,
      command: text,
      draft: { ...session.applied },
      confirmation: false,
    }
  try {
    const draft = patchInput(session.applied, response.patch),
      result = calculate(draft)
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source,
      command: text,
      baseline: { ...session.baseline },
      candidate: { ...draft },
      result,
      applied: false,
    }
    return {
      ...session,
      draft,
      result,
      source,
      command: text,
      message: response.message,
      confirmation: false,
      records: [record, ...session.records].slice(0, 20),
    }
  } catch (error) {
    return {
      ...session,
      message: (error as Error).message,
      result: null,
      confirmation: false,
    }
  }
}
export default function EngineeringPanel({
  machine,
  session,
  update,
  inspect,
  request,
  setRequest,
}: {
  machine: MachineId
  session: Session
  update: (s: Session) => void
  inspect: (part: string) => void
  request: string
  setRequest: (s: string) => void
}) {
  const [tab, setTab] = useState("Physics")
  const voice = useVoiceInput(machine, (text) => {
    setRequest(text)
    update(propose(session, text, "voice"))
    setTab("Experiments")
  })
  const active = calculate(session.applied),
    baseline = calculate(session.baseline),
    result = session.result
  const changed = fields[machine].filter(
    (field) =>
      (session.draft as unknown as Record<string, number>)[field.key] !==
      (session.applied as unknown as Record<string, number>)[field.key],
  )
  const edit = (key: string, raw: string) =>
    update({
      ...session,
      draft: {
        ...session.draft,
        [key]: raw.trim() === "" ? NaN : Number(raw),
      } as Inputs,
      result: null,
      message: "Draft changed. Calculate to review before applying.",
      source: "control",
      command: "",
      confirmation: false,
    })
  const run = () => {
    const next = calculate(session.draft)
    update({
      ...session,
      result: next,
      confirmation: false,
      message: next.errors.length
        ? "Correct invalid inputs before applying."
        : "Candidate calculated. Review the assumptions and limit checks.",
      records: next.errors.length
        ? session.records
        : [
            {
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              source: session.source,
              command: session.command,
              baseline: { ...session.baseline },
              candidate: { ...session.draft },
              result: next,
              applied: false,
            },
            ...session.records,
          ].slice(0, 20),
    })
    setTab("Experiments")
  }
  const apply = () => {
    if (!result || result.errors.length) return
    if (result.status !== "Within configured limits" && !session.confirmation) {
      update({ ...session, confirmation: true })
      return
    }
    update({
      ...session,
      applied: { ...session.draft },
      message:
        "Candidate applied to the illustrative assembly. No physical safety claim is implied.",
      confirmation: false,
      records: session.records.map((record, i) =>
        i === 0 ? { ...record, applied: true } : record,
      ),
    })
  }
  const send = (text: string) => {
    update(propose(session, text))
    setTab("Experiments")
  }
  return (
    <section
      className="panel engineering"
      aria-label="Engineering calculations"
    >
      <div className="engineering-heading">
        <div>
          <FlaskConical size={17} />
          <strong>Engineering sandbox</strong>
        </div>
        <span className="tag">DETERMINISTIC · NOT VALIDATED PHYSICS</span>
      </div>
      <div
        className="engineering-tabs"
        role="tablist"
        aria-label="Engineering panels"
      >
        {[
          ["Physics", FunctionSquare],
          ["Design", PencilRuler],
          ["Experiments", FlaskConical],
        ].map(([name, Icon]) => {
          const Glyph = Icon as typeof FlaskConical
          return (
            <button
              type="button"
              role="tab"
              aria-selected={tab === name}
              key={String(name)}
              onClick={() => setTab(String(name))}
              className={tab === name ? "eng-active" : ""}
            >
              <Glyph size={14} />
              {String(name)}
            </button>
          )
        })}
        <span
          className={
            active.status === "Within configured limits"
              ? "eng-status"
              : "eng-status amber"
          }
        >
          {active.status === "Within configured limits" ? (
            <Check size={12} />
          ) : (
            <AlertTriangle size={12} />
          )}
          <span>{active.status}</span>
        </span>
      </div>
      <div className="engineering-content" role="tabpanel" aria-label={tab}>
        <div className="eng-disclosure">
          Calculated from explicit equations. Coefficients and limits are
          illustrative assumptions—not certified ratings or predictions of
          failure.
        </div>
        {tab !== "Experiments" ? (
          <>
            <div className="eng-inputs">
              {fields[machine]
                .filter((field) => tab !== "Design" || field.design)
                .map((field) => {
                  const value =
                    (session.draft as unknown as Record<string, number>)[
                      field.key
                    ]
                  return (
                    <label className="eng-field" key={field.key}>
                      <span>
                        {field.label}
                        {field.assumed && <small>ASSUMED</small>}
                      </span>
                      <div>
                        <input
                          aria-label={`${field.label} (${field.unit})`}
                          type="number"
                          value={Number.isFinite(value) ? value : ""}
                          min={field.min}
                          max={field.max}
                          step={field.key === "cylinders" ? 1 : "any"}
                          onChange={(e) => edit(field.key, e.target.value)}
                        />
                        <span>{field.unit}</span>
                      </div>
                    </label>
                  )
                })}
            </div>
            {tab === "Design" && (
              <p className="eng-help">
                {machine === "motor"
                  ? "Shaft diameter affects illustrative geometry only in this loss-budget model."
                  : machine === "engine"
                    ? "Bore and stroke affect displacement and estimated power. The piston is exposed for illustration."
                    : "Diameter and length affect ideal shaft torsion and illustrative geometry."}{" "}
                Dimensions are normalized to the default model; not
                manufacturing CAD.{" "}
                {machine === "engine" &&
                  `Cylinder count is an accounting multiplier, not a multi-cylinder CAD reconstruction.`}
              </p>
            )}
            {tab === "Physics" && (
              <div className="formula-list">
                {active.outputs.map((output) => (
                  <div key={output.label}>
                    <div>
                      <strong>{output.label}</strong>
                      <span>
                        {formatValue(output.value)}{" "}
                        {output.value === null ? "" : output.unit}
                      </span>
                    </div>
                    <code>{output.formula}</code>
                    <small>{output.substitution}</small>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {result ? (
              <>
                <div className="eng-result-heading">
                  <strong>{result.status}</strong>
                  <span>Candidate vs. saved baseline</span>
                </div>
                {result.errors.map((error) => (
                  <p className="eng-error" key={error}>
                    {error}
                  </p>
                ))}
                {!result.errors.length && (
                  <>
                    <div className="eng-deltas">
                      {changed.length ? (
                        changed.map((field) => (
                          <span key={field.key}>
                            {field.label}:{" "}
                            {formatValue(
                              (session.applied as unknown as Record<string, number>)[
                                field.key
                              ],
                            )}{" "}
                            →{" "}
                            <b>
                              {formatValue(
                                (session.draft as unknown as Record<string, number>)[
                                  field.key
                                ],
                              )}{" "}
                              {field.unit}
                            </b>
                          </span>
                        ))
                      ) : (
                        <span>
                          No input change from the applied configuration.
                        </span>
                      )}
                    </div>
                    <div className="eng-comparison">
                      <div>
                        <span>CALCULATED QUANTITY</span>
                        <span>BASELINE</span>
                        <span>CANDIDATE</span>
                        <span>CHANGE</span>
                      </div>
                      {result.outputs.map((output, i) => {
                        const before = baseline.outputs[i]?.value ?? null
                        return (
                          <div key={output.label}>
                            <span>
                              {output.label}
                              <small>{output.unit}</small>
                            </span>
                            <span>{formatValue(before)}</span>
                            <strong>{formatValue(output.value)}</strong>
                            <span>
                              {before !== null && output.value !== null
                                ? `${formatValue(output.value - before)}${
                                    before !== 0
                                      ? ` (${formatValue(((output.value - before) / before) * 100)}%)`
                                      : ""
                                  }`
                                : "—"}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <details className="eng-details">
                      <summary>
                        Inspect candidate equations and substitutions
                      </summary>
                      {result.outputs.map((output) => (
                        <p key={output.label}>
                          <code>{output.formula}</code>
                          <br />
                          {output.substitution} = {formatValue(output.value)}{" "}
                          {output.unit}
                        </p>
                      ))}
                    </details>
                  </>
                )}
              </>
            ) : (
              <div className="eng-empty">
                <FlaskConical size={26} />
                <strong>Ask a what-if. Compare the evidence.</strong>
                <p>
                  Edit an input or use a supported command, then calculate a
                  candidate. Nothing changes until you apply it.
                </p>
              </div>
            )}
            <div className="experiment-history">
              <div className="section-label">
                SESSION EXPERIMENTS · {session.records.length}/20
              </div>
              {session.records.slice(0, 5).map((record) => (
                <div key={record.id}>
                  <span>
                    {new Date(record.timestamp).toLocaleTimeString()} ·{" "}
                    {record.source}
                  </span>
                  <strong>
                    {record.command || "Manual parameter experiment"}
                  </strong>
                  <small>
                    {record.result.status} ·{" "}
                    {record.applied ? "Applied" : "Calculated only"}
                  </small>
                </div>
              ))}
            </div>
          </>
        )}
        {(result || active).checks.map((check) => (
          <div
            className={check.exceeded ? "eng-limit exceeded" : "eng-limit"}
            key={check.label}
          >
            <span>
              {check.exceeded ? (
                <AlertTriangle size={13} />
              ) : (
                <Check size={13} />
              )}{" "}
              {check.label}: {formatValue(check.actual)} /{" "}
              {formatValue(check.limit)} {check.unit}
            </span>
            <button type="button" onClick={() => inspect(check.component)}>
              {check.exceeded ? "Inspect affected part" : "View component"}
              <ArrowUpRight size={11} />
            </button>
          </div>
        ))}
        {(result || active).contradictions.map((message) => (
          <p className="eng-error" key={message}>
            {message}
          </p>
        ))}
        <details className="eng-details">
          <summary>Assumptions & unsupported conclusions</summary>
          {active.limitations.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </details>
        <div className="eng-actions">
          <button type="button" className="btn" onClick={run}>
            <FlaskConical size={13} /> Calculate
          </button>
          <button
            type="button"
            className="btn eng-apply"
            disabled={!result || !!result.errors.length}
            onClick={apply}
          >
            {session.confirmation
              ? "Confirm hypothetical exceedance"
              : "Apply candidate"}
          </button>
          <button
            type="button"
            className="tool"
            onClick={() =>
              update({
                ...session,
                draft: { ...session.applied },
                result: null,
                confirmation: false,
                message: "Draft discarded.",
              })
            }
          >
            Discard
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => {
              update(propose(session, "reset parameters"))
              setTab("Experiments")
            }}
          >
            <RotateCcw size={12} /> Defaults
          </button>
          <button
            type="button"
            className="tool"
            onClick={() =>
              update({
                ...session,
                baseline: { ...session.applied },
                result: null,
                confirmation: false,
                message:
                  "Current applied inputs are the new comparison baseline.",
              })
            }
          >
            Set current as baseline
          </button>
        </div>
        {session.confirmation && (
          <p className="eng-error">
            This candidate exceeds assumed limits or has an energy
            contradiction. Apply only as a hypothetical sensitivity
            experiment—not an approved operating point.
          </p>
        )}
        <div className="eng-command">
          <span className="section-label">
            LOCAL COMMAND ASSISTANT · NO LIVE AI
          </span>
          <div className="eng-prompts">
            {[
              "Increase speed by 20%",
              machine === "engine"
                ? "Set bore to 60 mm"
                : "Set shaft diameter to 25 mm",
              "How can I improve efficiency?",
            ].map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={() => {
                  setRequest(prompt)
                  send(prompt)
                }}
              >
                {prompt}
                <ArrowUpRight size={10} />
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(request)
            }}
          >
            <input
              aria-label="Engineering what-if command"
              placeholder="What if I increase speed by 20%?"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
            <button
              className="iconbtn"
              type="button"
              onClick={voice.listening ? voice.stop : voice.start}
              aria-label={
                voice.listening
                  ? "Stop voice input"
                  : "Start optional voice input"
              }
            >
              {voice.listening ? <Square size={15} /> : <Mic size={15} />}
            </button>
            <button className="btn" type="submit">
              Propose <ArrowUpRight size={12} />
            </button>
          </form>
          <p className="eng-help">
            Optional browser speech may send audio to the browser vendor. No
            audio is stored here. All changes require review.
          </p>
        </div>
        <p className="eng-message" aria-live="polite">
          {voice.message || session.message}
        </p>
      </div>
    </section>
  )
}
