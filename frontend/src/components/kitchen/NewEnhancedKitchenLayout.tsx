import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw,
  Volume2,
  VolumeX,
  Clock,
  ChefHat,
  Package,
  AlertCircle,
  LogOut,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/api/client';
import type { User as UserType, Order } from '@/types';
import { KOTCard, displayTicketNo } from './KOTCard';
import { ConsolidatedPrepList } from './ConsolidatedPrepList';
import { publishOrderReady } from '@/lib/kdsRealtime';
import { KDS_COLUMN_META, partitionKdsOrders, type KdsColumnId } from './kdsKanban';
import { useToast } from '@/hooks/use-toast';

interface NewEnhancedKitchenLayoutProps {
  user: UserType;
}

const TARGET_PREP_MIN = 15;

const COLUMN_ORDER: KdsColumnId[] = ['placed', 'preparing', 'atPass'];

export function NewEnhancedKitchenLayout({ user }: NewEnhancedKitchenLayoutProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState('active-orders');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [volume, setVolume] = useState(0.7);

  const {
    data: ordersResponse,
    isLoading,
    refetch,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['newEnhancedKitchenOrders'],
    queryFn: () => apiClient.getKitchenOrders('all'),
    refetchInterval: autoRefresh ? 3000 : false,
    refetchOnWindowFocus: true,
    retry: 2,
    select: (data) => data.data || [],
  });

  const { data: takeawayReady = [] } = useQuery({
    queryKey: ['kitchenTakeawayReady'],
    queryFn: async () => {
      const res = await apiClient.getOrders({ status: 'ready', order_type: 'takeout', per_page: 50 });
      return res.data ?? [];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const orders = (ordersResponse || []) as Order[];

  const columns = useMemo(() => partitionKdsOrders(orders), [orders]);

  const urgentCount = useMemo(() => {
    return orders.filter((order: Order) => {
      if (order.status === 'ready') return false;
      const start = order.kot_first_sent_at || order.created_at;
      if (!start) return false;
      const minutes = (Date.now() - new Date(start).getTime()) / 1000 / 60;
      return minutes >= TARGET_PREP_MIN;
    }).length;
  }, [orders]);

  const lineTotal = orders.length;

  const markPickedUpMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.updateOrderStatus(orderId, 'served'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] });
      queryClient.invalidateQueries({ queryKey: ['kitchenTakeawayReady'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({
        title: 'Ticket cleared',
        description: 'Order marked as picked up / served and removed from the line.',
      });
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: 'Could not update order',
        description: err.message || 'Try again.',
      });
    },
  });

  const bumpMutation = useMutation({
    mutationFn: async (order: Order) => {
      const id = typeof order?.id === 'string' ? order.id.trim() : '';
      if (!id) {
        throw new Error('Missing order id — refresh the kitchen screen');
      }
      const res = await apiClient.kitchenBumpOrder(id);
      if (!res.success) throw new Error(res.message || 'Bump failed');
      return { res, order };
    },
    onError: (err: Error) => {
      const msg = err.message || '';
      if (msg.includes('Order not found') || msg.includes('Network Error') || msg.includes('ECONNREFUSED')) {
        void queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] });
      }
      toast({
        variant: 'destructive',
        title: 'Could not mark order ready',
        description:
          msg.includes('Network Error') || msg.includes('ECONNREFUSED')
            ? 'API unreachable — check that the backend is running, then try again.'
            : msg,
      });
    },
    onSuccess: ({ res, order }) => {
      const data = res.data;
      if (data?.ready_for_pickup) {
        publishOrderReady({
          type: 'order_ready_for_pickup',
          orderId: order.id,
          orderNumber: order.order_number,
          tableId: (data.table_id as string | undefined) ?? order.table_id ?? null,
          completionSeconds: data.completion_seconds ?? 0,
          kitchenBumpedAt:
            typeof data.kitchen_bumped_at === 'string'
              ? data.kitchen_bumped_at
              : new Date().toISOString(),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] });
      queryClient.invalidateQueries({ queryKey: ['kitchenTakeawayReady'] });
      if (soundEnabled) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.setValueAtTime(880, ctx.currentTime);
          g.gain.setValueAtTime(volume * 0.25, ctx.currentTime);
          o.start();
          o.stop(ctx.currentTime + 0.2);
        } catch {
          /* ignore */
        }
      }
    },
  });

  const handleLogout = () => {
    apiClient.clearAuth();
    window.location.href = '/login';
  };

  const handleItemTogglePrepared = async (orderId: string, itemId: string, prepared: boolean) => {
    const next = prepared ? 'ready' : 'sent';
    await apiClient.updateOrderItemStatus(orderId, itemId, next);
    await queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] });
  };

  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : 'Unknown error';

  const SoundSettingsPanel = () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Sound Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Enable Sounds</label>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn('w-12 h-6 rounded-full transition-colors', soundEnabled ? 'bg-blue-600' : 'bg-gray-300')}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full bg-white dark:bg-gray-200 transition-transform',
                soundEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Volume</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );

  const TakeawayBoard = () => {
    if (takeawayReady.length === 0) {
      return (
        <div className="text-center py-8">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No takeaway orders ready</p>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {takeawayReady.map((order: Order) => {
          const waitTime = Math.floor(
            (new Date().getTime() - new Date(order.updated_at).getTime()) / 1000 / 60
          );
          return (
            <Card key={order.id} className="border-green-500 bg-green-50">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl font-bold text-green-800">{displayTicketNo(order.order_number)}</CardTitle>
                <div className="text-lg font-semibold">{order.customer_name || 'Guest'}</div>
                <Badge variant="outline" className="text-green-700 border-green-700">
                  Ready for pickup
                </Badge>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-sm text-muted-foreground">Ready for {waitTime} minutes</div>
                <div className="mt-2">
                  {order.items?.map((item) => (
                    <div key={item.id} className="text-sm">
                      {item.quantity}x {item.product?.name}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  className="mt-4 w-full font-semibold bg-slate-800 hover:bg-slate-900"
                  disabled={markPickedUpMutation.isPending}
                  onClick={() => markPickedUpMutation.mutate(order.id)}
                >
                  {markPickedUpMutation.isPending && markPickedUpMutation.variables === order.id
                    ? 'Updating…'
                    : 'Picked up — clear'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const KanbanColumn = ({ col }: { col: KdsColumnId }) => {
    const meta = KDS_COLUMN_META[col];
    const list = columns[col];
    return (
      <div className="flex min-w-[300px] max-w-[380px] flex-1 flex-col rounded-xl border border-slate-200/90 bg-slate-100/50 shadow-inner">
        <div
          className={cn(
            'shrink-0 rounded-t-xl bg-gradient-to-r px-4 py-3 text-white shadow-sm',
            meta.headerClass
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold tracking-wide">{meta.label}</span>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-mono font-bold tabular-nums">
              {list.length}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-white/85 leading-snug">{meta.description}</p>
        </div>
        <div className="min-h-[280px] flex-1 space-y-3 overflow-y-auto p-3">
          {list.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300/80 dark:border-slate-600 bg-white/60 dark:bg-gray-800/60 text-center">
              <p className="text-xs font-medium text-slate-400">No tickets</p>
            </div>
          ) : (
            list.map((order) => (
              <KOTCard
                key={order.id}
                order={order as Order & { kot_first_sent_at?: string; server_name?: string }}
                targetPrepMinutes={TARGET_PREP_MIN}
                isAtPass={order.status === 'ready'}
                onItemTogglePrepared={handleItemTogglePrepared}
                onBump={async (id) => {
                  const o = list.find((x) => x.id === id) ?? order;
                  await bumpMutation.mutateAsync(o);
                }}
                bumpLoading={bumpMutation.isPending && bumpMutation.variables?.id === order.id}
                onPickedUp={(id) => markPickedUpMutation.mutate(id)}
                pickedUpLoading={markPickedUpMutation.isPending && markPickedUpMutation.variables === order.id}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-200/60 dark:bg-gray-900 pb-4">
      <div className="shrink-0 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center">
              <div className="mr-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-md">
                <ChefHat className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">Kitchen Display</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {user.first_name} {user.last_name} · {lineTotal} active ticket{lineTotal !== 1 ? 's' : ''}
                  {isFetching && !isLoading ? ' · updating…' : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1 border-0 bg-amber-500 text-xs font-semibold hover:bg-amber-500/90">
                <LayoutGrid className="h-3.5 w-3.5" />
                {columns.placed.length} Placed
              </Badge>
              <Badge className="gap-1 border-0 bg-teal-600 text-xs font-semibold hover:bg-teal-600/90">
                {columns.preparing.length} Preparing
              </Badge>
              <Badge className="gap-1 border-0 bg-emerald-600 text-xs font-semibold hover:bg-emerald-600/90">
                {columns.atPass.length} Ready
              </Badge>
              {urgentCount > 0 && (
                <Badge variant="destructive" className="text-xs font-semibold">
                  {urgentCount} urgent (&gt;{TARGET_PREP_MIN}m)
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <div
                className={cn('h-2 w-2 rounded-full', autoRefresh ? 'animate-pulse bg-emerald-500' : 'bg-slate-300')}
              />
              <span className="text-xs font-medium text-slate-600">{autoRefresh ? 'Live' : 'Paused'}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4', (isLoading || isFetching) && 'animate-spin')} />
            </Button>
            <Button variant={autoRefresh ? 'default' : 'outline'} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
              <Clock className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSoundSettings(!showSoundSettings)}>
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="text-red-600 hover:text-red-700">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {showSoundSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative">
            <SoundSettingsPanel />
            <Button variant="outline" size="sm" onClick={() => setShowSoundSettings(false)} className="absolute -right-2 -top-2">
              ×
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col px-3 py-4 sm:px-4">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mb-4 grid h-12 w-full max-w-lg shrink-0 grid-cols-2">
            <TabsTrigger value="active-orders" className="gap-2 text-sm font-semibold sm:text-base">
              <ChefHat className="h-5 w-5" />
              Line ({lineTotal})
            </TabsTrigger>
            <TabsTrigger value="takeaway-ready" className="gap-2 text-sm font-semibold sm:text-base">
              <Package className="h-5 w-5" />
              Takeaway ({takeawayReady.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active-orders" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {isLoading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3">
                <RefreshCw className="h-10 w-10 animate-spin text-orange-600" />
                <p className="text-sm text-slate-500">Loading kitchen queue…</p>
              </div>
            ) : (
              <>
                {error && (
                  <div
                    role="alert"
                    className="mb-4 flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 shadow-sm sm:flex-row sm:items-center"
                  >
                    <AlertCircle className="h-8 w-8 shrink-0 text-red-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-red-900">Could not load orders</p>
                      <p className="mt-1 break-words text-sm text-red-800">{errorMessage}</p>
                      <p className="mt-2 text-xs text-red-700/90">
                        Confirm the API is reachable, you are logged in, and the backend is the latest build. The detail
                        above is from the server.
                      </p>
                    </div>
                    <Button className="shrink-0" onClick={() => refetch()}>
                      Try again
                    </Button>
                  </div>
                )}

                <div className="flex min-h-[calc(100vh-260px)] gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]">
                  {COLUMN_ORDER.map((col) => (
                    <KanbanColumn key={col} col={col} />
                  ))}
                </div>

                {!error && lineTotal === 0 && (
                  <p className="mt-3 text-center text-sm text-slate-500">
                    No tickets in the line. Fired KOTs will show in the columns above.
                  </p>
                )}

                {!error && orders.length > 0 && (
                  <div className="mt-4 shrink-0">
                    <ConsolidatedPrepList orders={orders} />
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="takeaway-ready" className="mt-0">
            <TakeawayBoard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
