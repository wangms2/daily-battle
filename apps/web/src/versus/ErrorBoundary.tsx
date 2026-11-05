// A screen that fails to draw shows a way out instead of a blank page.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../ui/bits';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="card mx-auto mt-10 max-w-sm space-y-3 p-4 text-center">
        <p className="text-[15px]">Something went wrong.</p>
        <Button className="w-full" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </section>
    );
  }
}
