/**
 * @module telemetry
 * Optional OpenTelemetry initialisation.
 * Wired when OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_TRACE_CONSOLE=1 is set.
 * Failure to initialise must never fail a game.
 */

import { logger, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_TRACE_CONSOLE, registerSpanContextGetter } from './config.js';

const log = logger.child({ mod: 'telemetry' });

let _tracer = null;

export async function initTelemetry() {
  if (!OTEL_EXPORTER_OTLP_ENDPOINT && !OTEL_TRACE_CONSOLE) return;

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { Resource } = await import('@opentelemetry/resources');
    const { SEMRESATTRS_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
    const { BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter }
      = await import('@opentelemetry/sdk-trace-base');

    const processors = [];

    if (OTEL_TRACE_CONSOLE) {
      processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
      log.info('OTel: console exporter enabled');
    }

    if (OTEL_EXPORTER_OTLP_ENDPOINT) {
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
      processors.push(new BatchSpanProcessor(new OTLPTraceExporter({ url: OTEL_EXPORTER_OTLP_ENDPOINT })));
      log.info({ endpoint: OTEL_EXPORTER_OTLP_ENDPOINT }, 'OTel: OTLP exporter enabled');
    }

    const sdk = new NodeSDK({
      resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: 'pawnbook' }),
      spanProcessors: processors,
    });

    sdk.start();
    const { trace } = await import('@opentelemetry/api');
    _tracer = trace.getTracer('pawnbook');
    // Wire the pino mixin so every log record carries traceId/spanId when inside a span
    registerSpanContextGetter(() => {
      const span = trace.getActiveSpan();
      if (!span?.isRecording()) return null;
      const ctx = span.spanContext();
      return { traceId: ctx.traceId, spanId: ctx.spanId };
    });
    log.info('OTel: SDK started');
  } catch (err) {
    // OTel failure must never fail the app
    log.warn({ err }, 'OTel init failed — continuing without tracing');
  }
}

/** @returns {import('@opentelemetry/api').Tracer|null} */
export function getTracer() {
  return _tracer;
}
