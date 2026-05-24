import { useState, useEffect, useCallback, useRef } from 'react';

interface UseRemoteDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useRemoteData<T = any>(
  fetchFn: () => Promise<T>,
  deps: any[] = [],
  options: { autoFetch?: boolean } = {}
): UseRemoteDataResult<T> {
  const { autoFetch = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(autoFetch); // only true if we'll auto-fetch
  const [error, setError] = useState<string | null>(null);

  const fetchFnRef = useRef(fetchFn);
  useEffect(() => { fetchFnRef.current = fetchFn; });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFnRef.current();
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setError(msg);
      console.error('useRemoteData error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) fetchData();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { data, loading, error, reload };
}