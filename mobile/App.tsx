import { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { queryClient } from './src/api/queryClient';
import Navigation from './src/navigation/index';

export default function App() {
  // Let React Query refetch stale queries when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f17" />
      <Navigation />
    </QueryClientProvider>
  );
}
