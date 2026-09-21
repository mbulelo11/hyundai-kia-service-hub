export type ToastType = 'success' | 'error' | 'info';

export type ToastPayload = {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
};

type ToastListener = (toast: ToastPayload) => void;

const listeners = new Set<ToastListener>();

export function subscribeToast(listener: ToastListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showToast(toast: ToastPayload) {
  listeners.forEach((listener) => listener(toast));
}

export function showSuccessToast(title: string, message?: string, duration = 2400) {
  showToast({ title, message, type: 'success', duration });
}

export function showErrorToast(title: string, message?: string, duration = 2400) {
  showToast({ title, message, type: 'error', duration });
}
