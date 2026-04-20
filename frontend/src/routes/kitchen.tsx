import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import apiClient from '@/api/client';
import { NewEnhancedKitchenLayout } from '@/components/kitchen/NewEnhancedKitchenLayout';
import { KitchenDisabledScreen } from '@/components/kitchen/KitchenDisabledScreen';
import { useKitchenSettings, isKDSEnabled } from '@/hooks/useKitchenSettings';
import type { User } from '@/types';

export const Route = createFileRoute('/kitchen')({
  component: KitchenPage,
});

function KitchenPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const settings = useKitchenSettings();

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    const storedUser = localStorage.getItem('pos_user');
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        apiClient.clearAuth();
      }
    }
    setIsLoadingAuth(false);
  }, []);

  if (isLoadingAuth || settings.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading kitchen…</p>
        </div>
      </div>
    );
  }

  if (!apiClient.isAuthenticated() || !user) {
    return <Navigate to="/login" replace />;
  }

  const hasKitchenAccess = user.role === 'kitchen' || user.role === 'admin';
  if (!hasKitchenAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold mb-2">Access denied</h1>
          <p className="text-muted-foreground mb-4">
            You don't have permission to view the Kitchen Display
          </p>
          <button
            onClick={() => (window.location.href = '/')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Back to POS
          </button>
        </div>
      </div>
    );
  }

  if (!isKDSEnabled(settings.mode)) {
    return <KitchenDisabledScreen userRole={user.role} />;
  }

  return <NewEnhancedKitchenLayout user={user} />;
}
