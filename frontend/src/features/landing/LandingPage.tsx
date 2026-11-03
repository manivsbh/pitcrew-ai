import { useEffect, useRef, useState } from "react"
import { PitCrewMark } from "../../PitCrewMark"
import {
  ArrowUpRight,
  ArrowDown,
  Layers,
  Plus,
  Play,
  Pause,
  MoveUpRight,
  AudioLines,
  ScanLine,
  Check,
  ArrowRight,
} from "lucide-react"
import { chapters, mapProgress } from "./chapters"
import "./landing.css"

function Still({ name, className = "" }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <div className={`landing-still-empty ${className}`}>
      Machine visualization
    </div>
  ) : (
    <img
      className={className}
      src={`/media/forma-motor-${name}.jpg`}
      alt="Cinematic illustration of an electric motor and bearing assembly"
      onError={() => setFailed(true)}
    />
  )
}
export default function LandingPage() {
  const story = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    progressLine = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0),
    [simple, setSimple] = useState(true),
    [reduced, setReduced] = useState(false)
  const [error, setError] = useState(""),
    [playback, setPlayback] = useState(false),
    [playing, setPlaying] = useState(false)
  const [saveData, setSaveData] = useState(false),
    [allowFilm, setAllowFilm] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const mobile = matchMedia("(max-width: 767px)"),
      motion = matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => {
      setSimple(mobile.matches || motion.matches)
      setReduced(motion.matches)
    }
    update()
    mobile.addEventListener("change", update)
    motion.addEventListener("change", update)
    setSaveData(
      Boolean(
        (navigator as Navigator & { connection?: { saveData?: boolean } })
          .connection?.saveData,
      ),
    )
    return () => {
      mobile.removeEventListener("change", update)
      motion.removeEventListener("change", update)
    }
  }, [])
  const canScrub = !simple && !error && (!saveData || allowFilm) && !playback
  useEffect(() => {
    if (!canScrub) return
    const node = story.current,
      film = video.current
    if (!node || !film) return
    let top = 0,
      range = 1,
      raf = 0,
      target = 0,
      current = 0,
      shown = -1,
      busy = false,
      seekingAt = 0,
      timeouts = 0,
      alive = true
    const measure = () => {
      top = node.getBoundingClientRect().top + window.scrollY
      range = Math.max(1, node.offsetHeight - window.innerHeight)
      request()
    }
    const seeked = () => {
      busy = false
      seekingAt = 0
      request()
    }
    const tick = () => {
      raf = 0
      if (!alive) return
      const p = Math.max(0, Math.min(1, (window.scrollY - top) / range)),
        mapped = mapProgress(p)
      if (shown !== mapped.index) {
        shown = mapped.index
        setActive(mapped.index)
      }
      if (progressLine.current)
        progressLine.current.style.transform = `scaleX(${p})`
      target = mapped.time
      const visible =
        window.scrollY + window.innerHeight >= top &&
        window.scrollY <= top + node.offsetHeight
      if (!visible || !film.duration || film.readyState < 1) return
      if (busy) {
        if (performance.now() - seekingAt > 1500) {
          busy = false
          timeouts++
          if (timeouts >= 2) {
            setError(
              "Scroll playback is slow on this device. Explore the stills or play the film.",
            )
            return
          }
        } else {
          request()
          return
        }
      }
      current += (target - current) * 0.22
      if (Math.abs(target - current) < 0.035) current = target
      const next = Math.max(0, Math.min(film.duration - 0.05, current))
      if (Math.abs(film.currentTime - next) > 0.035) {
        busy = true
        seekingAt = performance.now()
        try {
          film.currentTime = next
        } catch {
          busy = false
          setError(
            "Scroll video is unavailable. The story remains available below.",
          )
          return
        }
      }
      if (Math.abs(current - target) > 0.035 || busy) request()
    }
    function request() {
      if (!raf && alive) raf = requestAnimationFrame(tick)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener("scroll", request, { passive: true })
    window.addEventListener("resize", measure)
    film.addEventListener("loadedmetadata", request)
    film.addEventListener("seeked", seeked)
    film.pause()
    measure()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("scroll", request)
      window.removeEventListener("resize", measure)
      film.removeEventListener("loadedmetadata", request)
      film.removeEventListener("seeked", seeked)
      film.pause()
    }
  }, [canScrub, ready])
  useEffect(() => {
    if (!simple && !error && (!saveData || allowFilm)) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.chapter)
            if (Number.isFinite(index)) setActive(index)
          }
      },
      { rootMargin: "-20% 0px -35% 0px" },
    )
    document
      .querySelectorAll(".landing-chapter")
      .forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [simple, error, saveData, allowFilm])
  const play = async () => {
    setPlayback(true)
    setAllowFilm(true)
    requestAnimationFrame(async () => {
      story.current?.scrollIntoView({ block: "start", behavior: "instant" })
      const film = video.current
      if (!film) return
      try {
        await film.play()
        setPlaying(true)
      } catch {
        setError(
          "This browser could not play the film. The chapter images are still available.",
        )
        setPlaying(false)
      }
    })
  }
  const returnToScroll = () => {
    video.current?.pause()
    setPlaying(false)
    setPlayback(false)
  }
  const staticMode = simple || Boolean(error) || (saveData && !allowFilm)
  const chapter = chapters[active]
  return (
    <div
      className={`landing ${staticMode ? "landing-static" : ""} ${
        reduced ? "landing-reduced" : ""
      } ${playback ? "landing-playing" : ""}`}
    >
      <a className="landing-skip" href="#workspace">
        Skip introduction and open workspace
      </a>
      <nav className="landing-nav" aria-label="Main navigation">
        <a href="#introduction" className="landing-wordmark">
          <PitCrewMark size={24} />
          <span>
            PITCREW<span className="landing-voltage-badge">⚡ AI</span>
          </span>
        </a>
        <div className="landing-nav-links">
          {chapters.slice(1).map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className={chapter.id === c.id ? "is-active" : ""}
            >
              {c.label}
            </a>
          ))}
        </div>
        <a href="#workspace" className="landing-nav-cta">
          Open workspace <ArrowUpRight size={15} />
        </a>
      </nav>
      <main className="landing-main">
        <p className="landing-visually-hidden">
          A cinematic motor film moves from blueprint overlays to an exploded
          bearing, an amber inspection highlight, and reassembly as the story
          progresses. This is an illustration, not a physical simulation.
        </p>
        <div ref={story} className="landing-story">
          <div className="landing-stage" aria-hidden="true">
            <div className="landing-film-wrap">
              <Still
                name={staticMode ? chapter.image : "poster"}
                className="landing-film-poster"
              />
              <video
                ref={video}
                className={`landing-film ${ready && !error ? "is-ready" : ""}`}
                src={
                  !saveData || allowFilm
                    ? "/media/forma-motor-hero.mp4"
                    : undefined
                }
                poster="/media/forma-motor-poster.jpg"
                muted
                playsInline
                preload="metadata"
                onLoadedData={() => setReady(true)}
                onError={() =>
                  setError(
                    "Film unavailable. Explore the illustrated chapters below.",
                  )
                }
                onEnded={() => setPlaying(false)}
              />
            </div>
            <div className="landing-shade" />
            <div className="landing-cross landing-cross-one">
              <Plus size={12} />
            </div>
            <div className="landing-cross landing-cross-two">
              <Plus size={12} />
            </div>
            <div className="landing-machine-label">
              <span className="landing-green-dot" />
              MTR–6204<span>ENGINEERING VISUALIZATION / 01</span>
            </div>
            {active === 2 && (
              <div className="landing-evidence-float">
                <span>THE RELATIONSHIP, REVEALED</span>
                <strong>P = Tω</strong>
                <small>Power · torque · angular velocity</small>
              </div>
            )}
            {active === 3 && (
              <div className="landing-evidence-float landing-amber-float">
                <span>FOLLOW THE EVIDENCE</span>
                <strong>
                  <ScanLine size={20} /> Outer bearing race
                </strong>
                <small>Illustrative inspection target · not a diagnosis</small>
              </div>
            )}
            {active === 4 && (
              <div className="landing-evidence-float">
                <span>ONE QUESTION. A NEW PERSPECTIVE.</span>
                <strong>
                  <AudioLines size={19} /> “Increase speed by 20%”
                </strong>
                <small>Propose → calculate → review → apply</small>
              </div>
            )}
          </div>
          <div className="landing-chapters">
            {chapters.map((c, index) => (
              <section
                className={`landing-chapter ${
                  active === index ? "is-active" : ""
                }`}
                id={c.id}
                key={c.id}
                data-chapter={index}
                aria-label={c.label}
              >
                <div className="landing-chapter-copy">
                  <div className="landing-eyebrow">
                    <span className="landing-green-dot" />
                    {index === 0
                      ? "A NEW PERSPECTIVE ON ENGINEERING"
                      : `${c.number} / ${c.label.toUpperCase()}`}
                  </div>
                  <div className="landing-title">
                    {index === 0 ? (
                      <h1>
                        Every machine.
                        <br />A deeper
                        <br />
                        <em>understanding.</em>
                      </h1>
                    ) : (
                      <h2>
                        {c.title.split("\n").map((line, i) => (
                          <span key={line}>
                            {i > 0 && <br />}
                            {line}
                          </span>
                        ))}
                      </h2>
                    )}
                  </div>
                  <p className="landing-description">{c.description}</p>
                  <div className="landing-chapter-actions">
                    {index === 0 ? (
                      <>
                        <a className="landing-primary" href="#workspace">
                          Enter the workspace <ArrowUpRight size={17} />
                        </a>
                        <a className="landing-secondary" href="#blueprint">
                          Discover the workflow <ArrowDown size={14} />
                        </a>
                      </>
                    ) : (
                      <a
                        className="landing-secondary"
                        href={
                          index === 4
                            ? "#workspace"
                            : `#${chapters[index + 1].id}`
                        }
                      >
                        {index === 4
                          ? "Try an experiment"
                          : `Next: ${chapters[index + 1].label}`}
                        <ArrowRight size={15} />
                      </a>
                    )}
                  </div>
                  <div className="landing-chapter-note">
                    <span />
                    {c.note}
                  </div>
                </div>
                <div className="landing-mobile-image">
                  <Still name={c.image} />
                  <span>ILLUSTRATIVE PRODUCT FILM / {c.number}</span>
                </div>
              </section>
            ))}
          </div>
          {playback && (
            <div className="landing-film-button">
              <button
                onClick={() => {
                  if (playing) {
                    video.current?.pause()
                    setPlaying(false)
                  } else void play()
                }}
              >
                {playing ? "Pause film" : "Play film"}
              </button>
              <button onClick={returnToScroll}>Return to story ×</button>
            </div>
          )}
          <div className="landing-story-bottom">
            <a href={`#${chapters[Math.min(active + 1, 4)].id}`}>
              <span className="landing-scroll-icon">
                <ArrowDown size={13} />
              </span>
              SCROLL TO EXPLORE
            </a>
            <div className="landing-chapter-indicator">
              <span>0{active + 1}</span>
              <div>
                {chapters.map((c, i) => (
                  <a
                    key={c.id}
                    href={`#${c.id}`}
                    className={active === i ? "is-active" : ""}
                    aria-label={`Chapter ${i + 1}: ${c.label}`}
                  />
                ))}
              </div>
              <span>05</span>
            </div>
            <span className="landing-story-caption">
              A closer look changes everything.
            </span>
          </div>
          <div className="landing-progress">
            <div ref={progressLine} />
          </div>
        </div>
        <section className="landing-conversion" id="start">
          <div className="landing-eyebrow">
            <span className="landing-green-dot" />
            THE NEXT MOVE IS YOURS
          </div>
          <h2>
            From understanding
            <br />
            to <em>action.</em>
          </h2>
          <p>
            Not another black box. Your machine, your assumptions,
            <br className="landing-desktop-break" /> and the tools to ask a
            better question.
          </p>
          <a className="landing-primary" href="#workspace">
            Open engineering workspace <ArrowUpRight size={17} />
          </a>
          <div className="landing-capabilities">
            {[
              ["01", "Three machines.", "Explore illustrative assemblies."],
              ["02", "Visible formulas.", "Inspect every calculation."],
              ["03", "Connected evidence.", "Understand the investigation."],
            ].map(([n, title, detail]) => (
              <div key={n}>
                <span>{n} /</span>
                <strong>{title}</strong>
                <p>{detail}</p>
              </div>
            ))}
          </div>
        </section>
        <div className="landing-media-controls">
          <div>
            <span className="landing-green-dot" />{" "}
            {playback
              ? "FILM PLAYBACK"
              : staticMode
                ? "ILLUSTRATED STORY"
                : "SCROLL-CONTROLLED FILM"}
          </div>
          {playback ? (
            <>
              <button
                onClick={() => {
                  if (playing) {
                    video.current?.pause()
                    setPlaying(false)
                  } else void play()
                }}
              >
                {playing ? <Pause size={13} /> : <Play size={13} />}{" "}
                {playing ? "Pause" : "Play"}
              </button>
              <button onClick={returnToScroll}>Return to story</button>
            </>
          ) : (
            <button
              onClick={() => {
                if (staticMode) {
                  setPlayback(true)
                  void play()
                  document
                    .querySelector(".landing-stage")
                    ?.scrollIntoView({ block: "center" })
                } else void play()
              }}
            >
              <Play size={12} /> Play film
            </button>
          )}
          {saveData && !allowFilm && (
            <button onClick={() => setAllowFilm(true)}>Load film</button>
          )}
        </div>
        {error && (
          <p className="landing-media-error" role="status">
            {error}
          </p>
        )}
      </main>
      <footer className="landing-footer">
        <a href="#introduction" className="landing-wordmark">
          <PitCrewMark size={18} /> PITCREW <span className="landing-voltage-badge">⚡ AI</span>
        </a>
        <span>
          Cinematic illustration. Generated dimensions are not engineering
          specifications.
        </span>
        <a href="#introduction">
          Back to the beginning <MoveUpRight size={12} />
        </a>
      </footer>
    </div>
  )
}
