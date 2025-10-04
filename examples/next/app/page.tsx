// @ts-nocheck
// Example server component using the client.
// In a Next.js app, put this under app/page.tsx.

import { api } from './api';

type Todo = { id: number; title: string; completed: boolean };

export default async function Page() {
  const todos = await api.get<Todo[]>('/todos', { query: { _limit: 5 } });
  return (
    <main>
      <h1>Todos</h1>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>
            {t.title} {t.completed ? '✅' : '⬜️'}
          </li>
        ))}
      </ul>
    </main>
  );
}
