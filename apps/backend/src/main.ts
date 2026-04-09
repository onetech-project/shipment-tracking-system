import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import * as cookieParser from 'cookie-parser'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const whitelist = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())

  app.use(cookieParser.default()) // For cross-origin cookies (e.g. session)
  app.useWebSocketAdapter(new IoAdapter(app))
  app.enableCors({
    origin: whitelist,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )

  const port = process.env.BACKEND_PORT ?? 4000
  await app.listen(port)
  console.log(`Backend running on port ${port}`)
}

bootstrap()
