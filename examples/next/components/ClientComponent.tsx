// @ts-nocheck
'use client';

// Example client component using the client.
// You can import the same api instance; in client-side context,
// fetch retries/timeout/abort work the same.

import { api } from '../app/api';
import { useEffect, useState } from 'react';

type Todo = { id: number; title: string; completed: boolean };

export function ClientComponent() {
  const [data, setData] = useState<Todo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();
    api
      .safeJson<Todo[]>('/todos', { query: { _limit: 3 }, signal: controller.signal })
      .then((res) => {
        if (aborted) return;
        if (!res.ok) setErr(String(res.error));
        else setData(res.data);
      });
    return () => {
      aborted = true;
      controller.abort();
    };
  }, []);

  if (err) return <div>Error: {err}</div>;
  if (!data) return <div>Loading...</div>;
  return (
    <ul>
      {data.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}
