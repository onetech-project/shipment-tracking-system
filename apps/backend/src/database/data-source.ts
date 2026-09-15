import 'reflect-metadata'
import { DataSource } from 'typeorm'
import * as dotenv from 'dotenv'
import { join } from 'path'

dotenv.config({ path: join(__dirname, '../../.env') })

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  // The spec files that sit beside the migrations must be excluded: this glob is require()d
  // directly, so a describe() block loaded as a migration crashes migration:run.
  migrations: [join(__dirname, './migrations/!(*.spec)*{.ts,.js}')],
  migrationsRun: false,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  migrationsTransactionMode: 'all',
})
