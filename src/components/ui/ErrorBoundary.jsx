import React from 'react'
import i18n from 'i18next'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    if (window.electronAPI?.diagLog) {
      window.electronAPI.diagLog(
        "error",
        "UI-Crash",
        `[ErrorBoundary] ${error.name}: ${error.message}\nComponent Stack: ${errorInfo.componentStack}`
      )
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-onicord-overlayer p-8 text-center">
          <h1 className="text-xl font-bold text-onicord-danger">{i18n.t("common.interfaceError", "Interface Error")}</h1>
          <p className="mt-2 max-w-md text-sm text-onicord-muted">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="onicord-btn-primary mt-6 px-6"
          >
            {i18n.t("common.reload", "Recargar")}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
