import * as Sentry from "@sentry/nextjs";

import { opcoesSentry } from "@/lib/sentry";

// Sentry no navegador. Sem o Session Replay: ele gravaria a tela, com as fotos das pessoas e os
// dados do checkout. A DSN é pública por natureza (só permite enviar eventos).
Sentry.init(opcoesSentry(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
