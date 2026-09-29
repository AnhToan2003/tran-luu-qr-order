import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught runtime exception:', error, errorInfo);
  }
  render() {
    if (this.state.failed) return <main role="alert" style={{ padding: 32 }}>
      <h1>Không thể hiển thị trang</h1>
      <p>Vui lòng tải lại trang. Nếu vừa gửi đơn hoặc thanh toán, hãy kiểm tra lịch sử trước khi thực hiện lại.</p>
      <button onClick={() => window.location.reload()}>Tải lại trang</button>
    </main>;
    return this.props.children;
  }
}
