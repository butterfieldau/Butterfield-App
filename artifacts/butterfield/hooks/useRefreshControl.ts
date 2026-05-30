import { useState } from 'react';

type Refreshable = () => void | Promise<unknown>;

export function useRefreshControl(...refetchFns: Refreshable[]) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(refetchFns.map((fn) => Promise.resolve(fn())));
    } finally {
      setRefreshing(false);
    }
  };
  return { refreshing, onRefresh };
}
