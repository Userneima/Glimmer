import React from 'react';
type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Glimmer UI crashed', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6">
        <div className="w-full max-w-lg rounded-apple-xl border border-slate-200/80 bg-white/85 p-6 shadow-apple-lg backdrop-blur-xl">
          <div className="mb-2 text-sm font-semibold text-sky-600">Glimmer</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">界面暂时卡住了</h1>
          <p className="mt-3 leading-relaxed text-slate-600">
            某个面板或日记内容触发了渲染异常。你的本地数据没有因此被删除，可以先重新加载界面继续使用。
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {error.message || 'Unknown UI error'}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center justify-center rounded-apple-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-sky-600 active:scale-[0.98]"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
