// Custom hook for consistent notifications across all portals
import { useState } from 'react';

interface NotificationState {
  open: boolean;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  details?: string;
  /**
   * Blockchain transaction id of the write this notification reports,
   * when the API returned one (see utils/txId extractTxId). Rendered
   * by NotificationDialog so the user can see the write landed.
   */
  txId?: string;
}

export const useNotification = () => {
  const [notification, setNotification] = useState<NotificationState>({
    open: false,
    type: 'success',
    title: '',
    message: '',
    details: '',
  });

  const showSuccess = (title: string, message: string, details?: string, txId?: string) => {
    setNotification({ open: true, type: 'success', title, message, details, txId });
  };

  const showError = (title: string, message: string, details?: string) => {
    setNotification({ open: true, type: 'error', title, message, details });
  };

  const showWarning = (title: string, message: string, details?: string) => {
    setNotification({ open: true, type: 'warning', title, message, details });
  };

  const showInfo = (title: string, message: string, details?: string) => {
    setNotification({ open: true, type: 'info', title, message, details });
  };

  const closeNotification = () => {
    setNotification({ ...notification, open: false });
  };

  return {
    notification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    closeNotification,
  };
};
