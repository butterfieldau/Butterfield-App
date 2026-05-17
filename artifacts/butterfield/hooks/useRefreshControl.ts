import { useState } from 'react';

export function useRefreshControl(...refetchFns: Array<() => Promise<any> | any>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(refetchFns.map((fn) => fn()));
    } finally {
      setRefreshing(false);
    }
  };
  return { refreshing, onRefresh };
}
