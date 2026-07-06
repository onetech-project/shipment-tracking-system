import { INestApplication } from '@nestjs/common'
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { applyAuthMetadata } from './apply-auth-metadata'
import { buildAuthMap } from './build-auth-map'

/**
 * Mounts Swagger UI at /api/docs. Every operation defaults to requiring the
 * `access-token` Bearer scheme; the post-processor then clears security on
 * `@Public()` routes and documents the required permission on `@Authorize()`
 * routes — all driven by the app's existing metadata.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Shipment Tracking System API')
    .setDescription(
      'REST API for the Shipment Tracking System. Private endpoints require a ' +
        'Bearer access token — obtain one via POST /api/auth/login, then click ' +
        'Authorize and paste the accessToken.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build()

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}.${methodKey}`,
  })

  // Default: every operation requires the bearer token…
  document.security = [{ 'access-token': [] }]

  // …then reconcile against the app's real @Public()/@Authorize() metadata.
  const discovery = app.get(DiscoveryService)
  applyAuthMetadata(document, buildAuthMap(discovery, new MetadataScanner()))

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  })
}
