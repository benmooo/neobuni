/**
 * Messaging integration routes.
 *
 * Both platform modules in the Hono server only expose inbound webhook handlers
 * (`POST /v1/integrations/discord/events` and
 * `POST /v1/integrations/telegram/events`). Those endpoints receive external
 * events and verify platform signatures/secrets, so they must stay raw Hono
 * routes and are intentionally not ported here.
 *
 * The namespaces are declared up front so authenticated config/CRUD/status
 * procedures can be added as they are migrated.
 */
export const integrationsRouter = {
	discord: {
		// TODO(server): raw webhook route — POST /v1/integrations/discord/events
		// verifies the Ed25519 signature and records interaction receipts.
	},
	telegram: {
		// TODO(server): raw webhook route — POST /v1/integrations/telegram/events
		// verifies the X-Telegram-Bot-Api-Secret-Token and drives external turns.
	},
};
