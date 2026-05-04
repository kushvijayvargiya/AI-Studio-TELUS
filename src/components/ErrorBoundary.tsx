import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
          <Card className="max-w-md w-full text-center p-8 shadow-2xl border-[#4B286D1A]">
            <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-rose-500" />
            </div>
            <h1 className="text-2xl font-black text-text-primary mb-2">Something went wrong</h1>
            <p className="text-text-secondary text-sm mb-8">
              An unexpected error occurred while rendering this component. We've logged the issue and are working on it.
            </p>
            
            {this.state.error && (
              <div className="bg-bg-secondary rounded-xl p-4 mb-8 text-left overflow-auto max-h-32 border border-border-primary">
                <code className="text-[10px] font-mono text-rose-600">
                  {this.state.error.toString()}
                </code>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button onClick={this.handleReset} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Application
              </Button>
              <Button variant="ghost" onClick={() => window.location.href = '/'} className="w-full">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
