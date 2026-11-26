import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Deliberately avoid logging sensitive user state to console
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-amber-50">
          <div className="twilight-glass rounded-[2rem] max-w-md w-full p-6 text-center flex flex-col gap-4">
            <h1 className="font-display font-bold text-2xl">Something went wrong</h1>
            <p className="text-sm text-amber-100/80">
              Starspell encountered an unexpected display error. Your saved progress remains safe.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full px-6 py-2.5 font-semibold text-sm text-slate-950 bg-amber-300 hover:bg-amber-200 cursor-pointer self-center"
            >
              Reload Starspell
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
