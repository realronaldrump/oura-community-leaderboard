import React from "react";
import { Button, StatePanel } from "./ui";

export default class AppErrorBoundary extends React.Component<{
  children: React.ReactNode;
  reload?: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page-loading" role="alert">
        <StatePanel
          title="This page couldn't load"
          headingLevel="h1"
          description="Reload the app to try again."
          action={(
            <Button onClick={() => this.props.reload ? this.props.reload() : window.location.reload()}>
              Reload app
            </Button>
          )}
        />
      </main>
    );
  }
}
