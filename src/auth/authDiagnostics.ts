// Temporary, memory-only observations. Never accept URL/session objects here.
let callbackDetected = false;
let urlCleanupAttempted = false;
let urlCleanupSucceeded = false;

export function observeAuthCallback(detected: boolean): void {
  callbackDetected = detected;
  urlCleanupAttempted = false;
  urlCleanupSucceeded = false;
}

export function observeUrlCleanup(succeeded: boolean): void {
  urlCleanupAttempted = true;
  urlCleanupSucceeded = succeeded;
}

export function getAuthDiagnostics() {
  return { callbackDetected, urlCleanupAttempted, urlCleanupSucceeded };
}
