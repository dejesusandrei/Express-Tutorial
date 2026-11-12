
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * ============================================================================
 * REQUEST CONTEXT: parang tracking number ng bawat request
 * ============================================================================
 *
 * Imagine may package kang pinadala. May tracking number ito para malaman
 * kung saan na ito dumaan at kung sino ang humawak dito.
 *
 * Ganoon din ang request sa Express.
 *
 * 1. Ang requestLogger ang nagbibigay ng unique requestId sa bawat request.
 * 2. Sine-save natin dito ang request information.
 * 3. Kapag may nag-log sa controller, service, o repository, automatic na
 *    masasama ang requestId sa log.
 *
 * Hindi na natin kailangang ipasa ang requestId sa bawat function.
 *
 * AsyncLocalStorage ang ginagamit ng Node.js para mag-store ng data na
 * available sa buong chain ng asynchronous operations ng isang request.
 *
 * IMPORTANT:
 * Kahit maraming requests ang sabay-sabay na tumatakbo, magkakahiwalay
 * ang kanilang context. Hindi mapagpapalit ang requestId ng bawat user.
 *
 * ============================================================================
 */

// Ito ang structure ng information na ise-save natin per request.
export type RequestContext = {
  requestId: string; // Unique ID para ma-track ang isang request.
  ip?: string; // IP address ng client (optional).
  userId?: string; // User ID, malalaman lang natin ito after authentication.
};

// Gumagawa ng storage na maghahawak ng context ng bawat request.
//
// Ang RequestContext ang nagsasabi kung anong data ang puwedeng i-store.
const storage = new AsyncLocalStorage<RequestContext>();

// Ginagamit ito para patakbuhin ang isang function sa loob ng request context.
//
// context = information na ise-save para sa request.
// fn = function na tatakbo habang active ang context.
//
// Generic ang <T> para kung ano man ang return type ng fn,
// iyon din ang magiging return type ng runWithRequestContext.
//
// storage.run() ang nagse-set ng context habang tumatakbo ang fn.
export const runWithRequestContext = <T>(
  context: RequestContext,
  fn: () => T
): T => storage.run(context, fn);

// Kinukuha nito ang current request context.
//
// Ginagamit ito ng Pino logger para automatic na maisama ang requestId,
// IP address, at userId sa logs.
//
// Partial<RequestContext> means puwedeng hindi kumpleto ang information.
// Halimbawa, wala pang userId kapag hindi pa authenticated ang user.
//
// Kapag walang active request context (halimbawa, server startup),
// empty object {} ang ibabalik instead of undefined.
export const getRequestContext = (): Partial<RequestContext> =>
  storage.getStore() ?? {};

// Tinatawag ito ng authMiddleware kapag verified na ang user's token.
//
// Dahil dito, malalaman na natin kung sinong user ang gumawa ng request.
// Ang mga susunod na logs ay puwede nang maglaman ng userId.
export const setRequestUserId = (userId: string): void => {
  // Kinukuha ang context ng kasalukuyang request.
  const store = storage.getStore();

  // Chine-check muna kung may active request context.
  // Kung meron, idinadagdag natin ang userId dito.
  if (store) {
    store.userId = userId;
  }
};
