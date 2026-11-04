import React from "react"
import ReactDOM from "react-dom/client"
import LandingExperience from "./LandingExperience"
import MetaCallLog from "./MetaCallLog"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LandingExperience />
    <MetaCallLog />
  </React.StrictMode>,
)
