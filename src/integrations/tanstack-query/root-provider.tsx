import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { getOrCreateQueryClient } from '@/lib/query-client'

export function getContext() {
  const queryClient = getOrCreateQueryClient()
  return {
    queryClient,
  }
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
