import {
  lazy,
  Suspense,
  useEffect,
  useState,
  Component,
  type ReactNode,
} from "react"
import LandingPage from "./features/landing/LandingPage"
const Workspace = lazy(() => import("./App"))
class WorkspaceBoundary extends Component<{ children: ReactNode }, {
  failed: boolean
}> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="landing-load">
        <p>The workspace could not load.</p>
        <button onClick={() => window.location.reload()}>Retry</button>
        <a href="#introduction">Back to introduction</a>
      </div>
    ) : (
      this.props.children
    )
  }
}
export default function LandingExperience() {
  const [workspace, setWorkspace] = useState(
    () => location.hash === "#workspace",
  )
  const [visited, setVisited] = useState(workspace)
  useEffect(() => {
    const sync = () => {
      const next = location.hash === "#workspace"
      setWorkspace(next)
      if (next) {
        setVisited(true)
        window.scrollTo(0, 0)
      } else
        requestAnimationFrame(() => {
          const element = document.getElementById(
            location.hash.slice(1) || "introduction",
          )
          element?.scrollIntoView({ block: "start" })
        })
    }
    window.addEventListener("hashchange", sync)
    if (!workspace && location.hash) sync()
    return () => window.removeEventListener("hashchange", sync)
  }, [])
  return (
    <>
      {!workspace && <LandingPage />}
      {visited && (
        <div hidden={!workspace}>
          <WorkspaceBoundary>
            <Suspense
              fallback={
                <div className="landing-load">
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800 }}>
                    PITCREW.ai
                  </span>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "1px", color: "var(--accent)" }}>
                    GIVING HEAVY MACHINERY A BRAIN
                  </p>
                  <p>Opening your engineering workspace…</p>
                  <a href="#introduction">Back to introduction</a>
                </div>
              }
            >
              <Workspace visible={workspace} />
            </Suspense>
          </WorkspaceBoundary>
        </div>
      )}
    </>
  )
}
