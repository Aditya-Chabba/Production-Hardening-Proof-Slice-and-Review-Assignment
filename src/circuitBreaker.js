'use strict';

class CircuitOpenError extends Error {
  constructor() {
    super('circuit is open');
    this.code = 'CIRCUIT_OPEN';
  }
}

function createCircuitBreaker(options = {}) {
  const failureThreshold = options.failureThreshold ?? 0.5;
  const minimumRequests = options.minimumRequests ?? 10;
  const openMillis = options.openMillis ?? 30000;
  const now = options.now ?? Date.now;
  const onStateChange = options.onStateChange ?? function () {};

  const metrics = {
    breaker_open_total: 0,
    short_circuited_total: 0,
    success_total: 0,
    failure_total: 0,
  };

  let state = 'CLOSED';
  let calls = 0;
  let failures = 0;
  let openedAt = 0;
  let probeInFlight = false;

  function setState(next) {
    state = next;
    onStateChange(next);
  }

  function trip() {
    openedAt = now();
    metrics.breaker_open_total++;
    setState('OPEN');
  }

  function shortCircuit() {
    metrics.short_circuited_total++;
    throw new CircuitOpenError();
  }

  async function exec(fn) {
    if (state === 'OPEN') {
      if (now() - openedAt < openMillis) shortCircuit();
      probeInFlight = false;
      setState('HALF_OPEN');
    }

    if (state === 'HALF_OPEN') {
      if (probeInFlight) shortCircuit();
      probeInFlight = true;
      try {
        const result = await fn();
        probeInFlight = false;
        metrics.success_total++;
        calls = 0;
        failures = 0;
        setState('CLOSED');
        return result;
      } catch (err) {
        probeInFlight = false;
        metrics.failure_total++;
        trip();
        throw err;
      }
    }

    // CLOSED
    try {
      const result = await fn();
      calls++;
      metrics.success_total++;
      return result;
    } catch (err) {
      calls++;
      failures++;
      metrics.failure_total++;
      if (calls >= minimumRequests && failures / calls >= failureThreshold) {
        trip();
      }
      throw err;
    }
  }

  return {
    exec,
    metrics,
    get state() {
      return state;
    },
  };
}

module.exports = { createCircuitBreaker, CircuitOpenError };