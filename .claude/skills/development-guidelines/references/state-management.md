# Choosing the Right State Management Tool

Source: https://development-guideline.vercel.app/docs/guidelines/state-management

## Overview

"Stop thinking about the size of your application and start thinking about where your data comes from." State divides into three categories: User State, Application State, Server State.

## 1. User State (Form State)

Data entered directly by users through forms and inputs.

### Controlled vs. Uncontrolled Components
Favor controlled components for non-trivial forms — greater control and predictability.

### Recommended Tool: `react-hook-form`
- **Performance:** Isolates re-renders, preventing unnecessary re-renders on keystroke
- **Simplicity:** The `useForm` hook supplies all necessary form state
- **Validation:** Integrates with schema validation libraries like Zod

```javascript
import { useForm } from 'react-hook-form';

function MyForm() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const onSubmit = data => console.log(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("firstName", { required: true })} />
      {errors.firstName && <span>This field is required</span>}
      <input type="submit" />
    </form>
  );
}
```

## 2. Application State (UI State)

UI-specific data: dark mode/theme, modal visibility, multi-step form progression, auth status indicators.

### Recommended Tool: `Zustand`
Alternatives: Redux Toolkit, Jotai.
- **Minimal Boilerplate:** No providers, actions, or reducers required
- **Simplicity:** Intuitive API
- **Performance:** Re-renders only components subscribed to changed state

```javascript
import { create } from 'zustand';

const useModalStore = create((set) => ({
  isModalOpen: false,
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));

function MyComponent() {
  const { isModalOpen, openModal, closeModal } = useModalStore();

  return (
    <div>
      <button onClick={openModal}>Open Modal</button>
      {isModalOpen && (
        <div>
          <h1>Modal Content</h1>
          <button onClick={closeModal}>Close</button>
        </div>
      )}
    </div>
  );
}
```

Note: State machines like XState are powerful for complex workflows but may be unnecessarily complex for straightforward UI state.

## 3. Server State (Async State)

API-fetched data: loading states, error states, caching, refetching/synchronization.

### Recommended Tool: `React Query`
Alternative: SWR.
- **Declarative Data Fetching:** You specify needed data; the library manages retrieval
- **Automatic Caching:** Improves perceived performance
- **Background Refetching:** Maintains freshness through automatic background updates
- **Developer Tools:** Devtools for inspecting queries and caches

```javascript
import { useQuery } from '@tanstack/react-query';

function MyComponent() {
  const { isLoading, error, data } = useQuery({
    queryKey: ['repoData'],
    queryFn: () =>
      fetch('https://api.github.com/repos/tannerlinsley/react-query').then(res =>
        res.json()
      ),
  });

  if (isLoading) return 'Loading...';
  if (error) return 'An error has occurred: ' + error.message;

  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.description}</p>
    </div>
  );
}
```

## Best Practices

- **Localize State When Feasible:** Keep state local via `useState` when limited to a single component
- **Select Appropriate Tools:** Don't apply server-state libraries to form management
- **Calculate Rather Than Store:** Derive values on-demand instead of storing computed results in state
