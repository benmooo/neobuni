import { Toaster } from "@neobuni/ui/components/sonner";
import { ThemeProvider } from "@neobuni/ui/components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { ChatDisplayPreferencesProvider } from "@/components/chat/chat-display-preferences";

import "../index.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
		},
	},
});

export const Route = createRootRoute({
	component: () => (
		<ThemeProvider>
			<ChatDisplayPreferencesProvider>
				<QueryClientProvider client={queryClient}>
					<Outlet />
				</QueryClientProvider>
			</ChatDisplayPreferencesProvider>
			<Toaster position="top-center" />
			{/*<TanStackRouterDevtools position="top-right"  />*/}
		</ThemeProvider>
	),
});
